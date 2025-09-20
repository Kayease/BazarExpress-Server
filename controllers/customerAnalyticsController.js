const User = require('../models/User');
const Order = require('../models/Order');
const Return = require('../models/Return');

// Get customer analytics overview
const getCustomerAnalytics = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate date range based on period
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get total customers
    const totalCustomers = await User.countDocuments({ role: 'user' });
    
    // Get new customers in period
    const newCustomers = await User.countDocuments({ 
      role: 'user',
      createdAt: { $gte: startDate }
    });

    // Get customer order statistics
    const customerStats = await Order.aggregate([
      {
        $group: {
          _id: '$userId',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$pricing.total' },
          lastOrderDate: { $max: '$createdAt' },
          firstOrderDate: { $min: '$createdAt' }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalSpent' },
          totalOrders: { $sum: '$totalOrders' },
          uniqueCustomers: { $sum: 1 },
          avgOrderValue: { $avg: '$totalSpent' },
          avgOrdersPerCustomer: { $avg: '$totalOrders' }
        }
      }
    ]);

    // Get returning customers (customers with more than 1 order)
    const returningCustomers = await Order.aggregate([
      {
        $group: {
          _id: '$userId',
          orderCount: { $sum: 1 }
        }
      },
      {
        $match: {
          orderCount: { $gt: 1 }
        }
      },
      {
        $count: 'returningCustomers'
      }
    ]);

    // Get monthly growth
    const monthlyGrowth = await User.aggregate([
      {
        $match: {
          role: 'user',
          createdAt: { $gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1 }
      },
      {
        $limit: 2
      }
    ]);

    // Calculate growth rate
    let growthRate = 0;
    if (monthlyGrowth.length >= 2) {
      const currentMonth = monthlyGrowth[0].count;
      const previousMonth = monthlyGrowth[1].count;
      growthRate = previousMonth > 0 ? ((currentMonth - previousMonth) / previousMonth) * 100 : 0;
    }

    // Get customer segments
    const customerSegments = await User.aggregate([
      {
        $match: { role: 'user' }
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'userId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          totalOrders: { $size: '$orders' },
          totalSpent: { $sum: '$orders.pricing.total' }
        }
      },
      {
        $bucket: {
          groupBy: '$totalSpent',
          boundaries: [0, 1000, 5000, 10000, 50000, Infinity],
          default: 'Other',
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ]);

    // Format customer segments
    const segments = {
      new: 0,
      regular: 0,
      vip: 0,
      at_risk: 0
    };

    customerSegments.forEach(segment => {
      if (segment._id === 0) segments.new = segment.count;
      else if (segment._id === 1000 || segment._id === 5000) segments.regular += segment.count;
      else if (segment._id === 10000 || segment._id === 50000) segments.vip += segment.count;
      else if (segment._id === Infinity) segments.at_risk += segment.count;
    });

    // Get top customers
    const topCustomers = await User.aggregate([
      {
        $match: { role: 'user' }
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'userId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          totalOrders: { $size: '$orders' },
          totalSpent: { $sum: '$orders.pricing.total' },
          averageOrderValue: {
            $cond: {
              if: { $gt: [{ $size: '$orders' }, 0] },
              then: { $divide: [{ $sum: '$orders.pricing.total' }, { $size: '$orders' }] },
              else: 0
            }
          },
          lastOrderDate: { $max: '$orders.createdAt' },
          firstOrderDate: { $min: '$orders.createdAt' }
        }
      },
      {
        $match: { totalOrders: { $gt: 0 } }
      },
      {
        $sort: { totalSpent: -1 }
      },
      {
        $limit: 10
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          phone: 1,
          totalOrders: 1,
          totalSpent: 1,
          averageOrderValue: 1,
          lastOrderDate: 1,
          firstOrderDate: 1
        }
      }
    ]);

    const stats = customerStats[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      uniqueCustomers: 0,
      avgOrderValue: 0,
      avgOrdersPerCustomer: 0
    };

    const analytics = {
      totalCustomers,
      newCustomers,
      totalRevenue: stats.totalRevenue,
      averageOrderValue: stats.avgOrderValue,
      monthlyGrowth: Math.round(growthRate * 100) / 100,
      returningCustomers: returningCustomers[0]?.returningCustomers || 0,
      repeatPurchaseRate: totalCustomers > 0 ? Math.round(((returningCustomers[0]?.returningCustomers || 0) / totalCustomers) * 100 * 100) / 100 : 0,
      customerSegments: segments,
      topCustomers: topCustomers
    };

    res.json({
      success: true,
      analytics
    });

  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch customer analytics',
      details: error.message 
    });
  }
};

// Get customer list with analytics
const getCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const sortBy = req.query.sortBy || 'totalSpent';
    const sortOrder = req.query.sortOrder || 'desc';
    const segment = req.query.segment; // new, regular, vip, inactive

    // Build search query
    let searchQuery = {};
    if (search) {
      searchQuery = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Get customers with their order statistics
    const customers = await User.aggregate([
      {
        $match: {
          role: 'user',
          ...searchQuery
        }
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'userId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          totalOrders: { $size: '$orders' },
          totalSpent: { $sum: '$orders.pricing.total' },
          averageOrderValue: {
            $cond: {
              if: { $gt: [{ $size: '$orders' }, 0] },
              then: { $divide: [{ $sum: '$orders.pricing.total' }, { $size: '$orders' }] },
              else: 0
            }
          },
          lastOrderDate: { $max: '$orders.createdAt' },
          firstOrderDate: { $min: '$orders.createdAt' }
        }
      },
      {
        $addFields: {
          customerSegment: {
            $cond: {
              if: { $eq: ['$totalOrders', 0] },
              then: 'inactive',
              else: {
                $cond: {
                  if: { $eq: ['$totalOrders', 1] },
                  then: 'new',
                  else: {
                    $cond: {
                      if: { $gte: ['$totalSpent', 10000] }, // VIP threshold
                      then: 'vip',
                      else: 'regular'
                    }
                  }
                }
              }
            }
          }
        }
      },
      {
        $match: segment ? { customerSegment: segment } : {}
      },
      {
        $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          phone: 1,
          createdAt: 1,
          totalOrders: 1,
          totalSpent: 1,
          averageOrderValue: 1,
          lastOrderDate: 1,
          firstOrderDate: 1,
          customerSegment: 1
        }
      }
    ]);

    // Get total count for pagination
    const totalCustomers = await User.aggregate([
      {
        $match: {
          role: 'user',
          ...searchQuery
        }
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'userId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          totalOrders: { $size: '$orders' },
          totalSpent: { $sum: '$orders.pricing.total' },
          customerSegment: {
            $cond: {
              if: { $eq: [{ $size: '$orders' }, 0] },
              then: 'inactive',
              else: {
                $cond: {
                  if: { $eq: [{ $size: '$orders' }, 1] },
                  then: 'new',
                  else: {
                    $cond: {
                      if: { $gte: [{ $sum: '$orders.pricing.total' }, 10000] },
                      then: 'vip',
                      else: 'regular'
                    }
                  }
                }
              }
            }
          }
        }
      },
      {
        $match: segment ? { customerSegment: segment } : {}
      },
      {
        $count: 'total'
      }
    ]);

    const total = totalCustomers[0]?.total || 0;

    res.json({
      success: true,
      customers,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalCustomers: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ 
      error: 'Failed to fetch customers',
      details: error.message 
    });
  }
};

// Get customer details with order history
const getCustomerDetails = async (req, res) => {
  try {
    const { customerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get customer details
    const customer = await User.findById(customerId).select('-password');
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get customer's orders
    const orders = await Order.find({ userId: customerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'items.productId',
        select: 'name price image category brand',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' }
        ]
      });

    // Get customer statistics
    const stats = await Order.aggregate([
      { $match: { userId: customer._id } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$pricing.total' },
          averageOrderValue: { $avg: '$pricing.total' },
          lastOrderDate: { $max: '$createdAt' },
          firstOrderDate: { $min: '$createdAt' }
        }
      }
    ]);

    // Get returns for this customer
    const returns = await Return.find({ userId: customerId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('orderId', 'orderId');

    const customerStats = stats[0] || {
      totalOrders: 0,
      totalSpent: 0,
      averageOrderValue: 0,
      lastOrderDate: null,
      firstOrderDate: null
    };

    const totalOrders = await Order.countDocuments({ userId: customerId });

    res.json({
      success: true,
      customer: {
        ...customer.toObject(),
        stats: customerStats,
        recentReturns: returns
      },
      orders,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        hasNext: page < Math.ceil(totalOrders / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch customer details',
      details: error.message 
    });
  }
};

// Get customer segments
const getCustomerSegments = async (req, res) => {
  try {
    const segments = await User.aggregate([
      {
        $match: { role: 'user' }
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'userId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          totalOrders: { $size: '$orders' },
          totalSpent: { $sum: '$orders.pricing.total' }
        }
      },
      {
        $bucket: {
          groupBy: '$totalSpent',
          boundaries: [0, 1000, 5000, 10000, 50000, Infinity],
          default: 'Other',
          output: {
            count: { $sum: 1 },
            avgOrders: { $avg: '$totalOrders' },
            avgSpent: { $avg: '$totalSpent' }
          }
        }
      }
    ]);

    // Format segments
    const formattedSegments = segments.map(segment => ({
      range: segment._id === 0 ? '0 - 1,000' :
             segment._id === 1000 ? '1,000 - 5,000' :
             segment._id === 5000 ? '5,000 - 10,000' :
             segment._id === 10000 ? '10,000 - 50,000' :
             segment._id === 50000 ? '50,000+' : 'Other',
      count: segment.count,
      avgOrders: Math.round(segment.avgOrders * 100) / 100,
      avgSpent: Math.round(segment.avgSpent * 100) / 100
    }));

    res.json({
      success: true,
      segments: formattedSegments
    });

  } catch (error) {
    console.error('Error fetching customer segments:', error);
    res.status(500).json({ 
      error: 'Failed to fetch customer segments',
      details: error.message 
    });
  }
};

module.exports = {
  getCustomerAnalytics,
  getCustomers,
  getCustomerDetails,
  getCustomerSegments
};
