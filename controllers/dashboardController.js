const Order = require('../models/Order');
const Return = require('../models/Return');
const User = require('../models/User');
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const Newsletter = require('../models/Newsletter');
const Banner = require('../models/Banner');
const Blog = require('../models/Blog');
const Notice = require('../models/Notice');
const Tax = require('../models/Tax');
const InvoiceSettings = require('../models/InvoiceSettings');

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getOrderStats(match = {}) {
  const [counts, totalRevenueAgg] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: null, revenue: { $sum: '$pricing.total' } } },
    ]),
  ]);

  const base = {
    total: 0,
    new: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    refunded: 0,
    totalRevenue: 0,
  };
  counts.forEach(c => {
    base[c._id] = c.count;
    base.total += c.count;
  });
  base.totalRevenue = (totalRevenueAgg[0]?.revenue) || 0;
  return base;
}

async function getTopProducts(match = {}, limit = 5) {
  // Compute top products by sales quantity and revenue from order items
  const pipeline = [
    { $match: match },
    { $unwind: '$items' },
    { $group: {
        _id: '$items.productId',
        sales: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
      }
    },
    { $sort: { sales: -1, revenue: -1 } },
    { $limit: limit },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, productId: '$_id', name: '$product.name', sales: 1, revenue: 1 } },
  ];
  return Order.aggregate(pipeline);
}

exports.getDashboard = async (req, res) => {
  try {
    const role = req.user.role;

    // Common filters for warehouse-restricted roles (cast to strings for mixed storage types)
    const assignedWarehouseIds = Array.isArray(req.assignedWarehouseIds) ? req.assignedWarehouseIds : [];
    const assignedWarehouseStringIds = assignedWarehouseIds.map((w) => w.toString());
    const warehouseFilter = (field = 'warehouseInfo.warehouseId') => (
      assignedWarehouseStringIds && assignedWarehouseStringIds.length
        ? { [field]: { $in: assignedWarehouseStringIds } }
        : {}
    );

    if (role === 'admin') {
      const [userCount, productCount, orderStats, newUsersToday, recentOrders, topProducts] = await Promise.all([
        User.countDocuments({}),
        Product.countDocuments({}),
        getOrderStats({}),
        User.countDocuments({ createdAt: { $gte: startOfDay() } }),
        Order.find({}).sort({ createdAt: -1 }).limit(5).select('orderId customerInfo pricing status createdAt warehouseInfo'),
        getTopProducts({}, 5),
      ]);

      // Last 7 days trends
      const last7 = new Date();
      last7.setDate(last7.getDate() - 6);
      last7.setHours(0, 0, 0, 0);
      const [revenueByDay, ordersByDay] = await Promise.all([
        Order.aggregate([
          { $match: { createdAt: { $gte: last7 } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$pricing.total' } } },
          { $sort: { _id: 1 } },
        ]),
        Order.aggregate([
          { $match: { createdAt: { $gte: last7 } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
      ]);

      return res.json({
        role,
        cards: {
          totalUsers: userCount,
          totalOrders: orderStats.total,
          totalProducts: productCount,
          totalRevenue: orderStats.totalRevenue,
          newUsersToday,
        },
        recentOrders,
        topProducts,
        orderStats,
        revenueByDay,
        ordersByDay,
      });
    }

    if (role === 'order_warehouse_management') {
      const match = warehouseFilter();
      const today = startOfDay();
      const monthStart = startOfMonth();
      
      const [orderStats, assignedWarehouses, recentOrders, todayOrders, monthOrders, pendingOrders] = await Promise.all([
        getOrderStats(match),
        Warehouse.find({ _id: { $in: req.assignedWarehouseIds || [] } }).select('name address'),
        Order.find(match).sort({ createdAt: -1 }).limit(10).select('orderId customerInfo pricing status createdAt warehouseInfo'),
        Order.countDocuments({ ...match, createdAt: { $gte: today } }),
        Order.countDocuments({ ...match, createdAt: { $gte: monthStart } }),
        Order.countDocuments({ ...match, status: { $in: ['new', 'processing'] } }),
      ]);

      // Orders and revenue last 7 days (warehouse filtered)
      const last7 = new Date();
      last7.setDate(last7.getDate() - 6);
      last7.setHours(0, 0, 0, 0);
      const [ordersByDay, revenueByDay] = await Promise.all([
        Order.aggregate([
          { $match: { ...match, createdAt: { $gte: last7 } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        Order.aggregate([
          { $match: { ...match, createdAt: { $gte: last7 } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$pricing.total' } } },
          { $sort: { _id: 1 } },
        ]),
      ]);

      // Top products for assigned warehouses
      const topProducts = await getTopProducts(match, 5);

      // Return stats for assigned warehouses
      const [
        returnsRequested,
        returnsApproved,
        returnsPickupAssigned,
        returnsPickupRejected,
        returnsPickedUp,
        returnsReceived,
        returnsPartiallyRefunded,
        returnsRefunded,
        returnsRejected,
        returnsToday
      ] = await Promise.all([
        Return.countDocuments({ ...match, status: 'requested' }),
        Return.countDocuments({ ...match, status: 'approved' }),
        Return.countDocuments({ ...match, status: 'pickup_assigned' }),
        Return.countDocuments({ ...match, status: 'pickup_rejected' }),
        Return.countDocuments({ ...match, status: 'picked_up' }),
        Return.countDocuments({ ...match, status: 'received' }),
        Return.countDocuments({ ...match, status: 'partially_refunded' }).catch(() => 0),
        Return.countDocuments({ ...match, status: 'refunded' }),
        Return.countDocuments({ ...match, status: 'rejected' }),
        Return.countDocuments({ ...match, createdAt: { $gte: today } })
      ]);

      return res.json({
        role,
        cards: {
          totalOrders: orderStats.total,
          todayOrders,
          monthOrders,
          pendingOrders,
          totalRevenue: orderStats.totalRevenue,
          avgOrderValue: orderStats.total > 0 ? orderStats.totalRevenue / orderStats.total : 0,
        },
        orderStats,
        assignedWarehouses,
        recentOrders,
        ordersByDay,
        revenueByDay,
        topProducts,
        returnStats: {
          requested: returnsRequested,
          approved: returnsApproved,
          pickup_assigned: returnsPickupAssigned,
          pickup_rejected: returnsPickupRejected,
          picked_up: returnsPickedUp,
          received: returnsReceived,
          partially_refunded: returnsPartiallyRefunded,
          refunded: returnsRefunded,
          rejected: returnsRejected,
          today: returnsToday,
          total: returnsRequested + returnsApproved + returnsPickupAssigned + returnsPickupRejected + returnsPickedUp + returnsReceived + returnsPartiallyRefunded + returnsRefunded + returnsRejected
        },
      });
    }

    if (role === 'product_inventory_management') {
      const prodMatch = req.assignedWarehouseIds && req.assignedWarehouseIds.length
        ? { warehouse: { $in: req.assignedWarehouseIds } }
        : {};

      const today = startOfDay();
      const monthStart = startOfMonth();

      const [productCount, lowStockCount, brandsCount, categoriesCount, assignedWarehouses, outOfStockCount, recentProducts] = await Promise.all([
        Product.countDocuments(prodMatch),
        Product.countDocuments({ ...prodMatch, $or: [ { stock: { $lte: 10 } }, { stock: { $lte: '$lowStockThreshold' } } ] }).catch(() => Product.countDocuments({ ...prodMatch, stock: { $lte: 10 } })),
        // Count distinct brands and categories among filtered products
        Product.distinct('brand', prodMatch).then(arr => arr.filter(Boolean).length),
        Product.distinct('category', prodMatch).then(arr => arr.filter(Boolean).length),
        Warehouse.find({ _id: { $in: req.assignedWarehouseIds || [] } }).select('name address'),
        Product.countDocuments({ ...prodMatch, stock: 0 }),
        Product.find(prodMatch).sort({ createdAt: -1 }).limit(5).select('name stock warehouse createdAt').populate('warehouse', 'name'),
      ]);

      const lowStockProducts = await Product.find({ ...prodMatch, stock: { $lte: 10 } })
        .select('name stock warehouse')
        .populate('warehouse', 'name')
        .limit(10);

      // Products added this month
      const productsThisMonth = await Product.countDocuments({ ...prodMatch, createdAt: { $gte: monthStart } });

      // Stock value calculation
      const stockValueAgg = await Product.aggregate([
        { $match: prodMatch },
        { $group: { _id: null, totalValue: { $sum: { $multiply: ['$stock', '$price'] } } } }
      ]);
      const totalStockValue = stockValueAgg[0]?.totalValue || 0;

      return res.json({
        role,
        cards: {
          totalProducts: productCount,
          lowStock: lowStockCount,
          outOfStock: outOfStockCount,
          brands: brandsCount,
          categories: categoriesCount,
          productsThisMonth,
          totalStockValue,
        },
        assignedWarehouses,
        lowStockProducts,
        recentProducts,
      });
    }

    if (role === 'marketing_content_manager') {
      const today = startOfDay();
      const monthStart = startOfMonth();

      const [newsletterStats, banners, blogs, notices, recentSubscribers, todaySubscribers, monthSubscribers, activeBanners, publishedBlogs] = await Promise.all([
        (async () => {
          const total = await Newsletter.countDocuments();
          const active = await Newsletter.countDocuments({ isSubscribed: true });
          const inactive = await Newsletter.countDocuments({ isSubscribed: false });
          return { total, active, inactive };
        })(),
        Banner.countDocuments({}),
        Blog.countDocuments({}),
        Notice.countDocuments({}),
        Newsletter.find({ isSubscribed: true }).sort({ subscribedAt: -1 }).limit(8).select('email subscribedAt source'),
        Newsletter.countDocuments({ subscribedAt: { $gte: today }, isSubscribed: true }),
        Newsletter.countDocuments({ subscribedAt: { $gte: monthStart }, isSubscribed: true }),
        Banner.countDocuments({ isActive: true }),
        Blog.countDocuments({ isPublished: true }),
      ]);

      // Subscription trends last 7 days
      const last7 = new Date();
      last7.setDate(last7.getDate() - 6);
      last7.setHours(0, 0, 0, 0);
      const subscriptionsByDay = await Newsletter.aggregate([
        { $match: { subscribedAt: { $gte: last7 }, isSubscribed: true } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$subscribedAt' } }, total: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);

      return res.json({
        role,
        cards: {
          subscribers: newsletterStats.active,
          totalSubscribers: newsletterStats.total,
          todaySubscribers,
          monthSubscribers,
          banners,
          activeBanners,
          blogs,
          publishedBlogs,
          notices,
        },
        recentSubscribers,
        subscriptionsByDay,
      });
    }

    if (role === 'customer_support_executive') {
      const today = startOfDay();
      const monthStart = startOfMonth();

      const [userStats, contactStats, orderStats, recentContacts, todayContacts, monthContacts, reviewStats] = await Promise.all([
        (async () => {
          const total = await User.countDocuments({});
          const active = await User.countDocuments({ status: 'active' });
          const disabled = await User.countDocuments({ status: 'disabled' });
          const newUsersToday = await User.countDocuments({ createdAt: { $gte: today } });
          const newUsersMonth = await User.countDocuments({ createdAt: { $gte: monthStart } });
          return { total, active, disabled, newUsersToday, newUsersMonth };
        })(),
        // contact stats via model to keep it simple
        (async () => {
          const Contact = require('../models/Contact');
          const total = await Contact.countDocuments({});
          const New = await Contact.countDocuments({ status: 'new' });
          const read = await Contact.countDocuments({ status: 'read' });
          const replied = await Contact.countDocuments({ status: 'replied' });
          const pending = await Contact.countDocuments({ status: { $in: ['new', 'read'] } });
          return { total, new: New, read, replied, pending };
        })(),
        getOrderStats({}),
        require('../models/Contact').find({}).sort({ createdAt: -1 }).limit(8).select('name email subject status createdAt'),
        require('../models/Contact').countDocuments({ createdAt: { $gte: today } }),
        require('../models/Contact').countDocuments({ createdAt: { $gte: monthStart } }),
        (async () => {
          const Review = require('../models/Review');
          const total = await Review.countDocuments({});
          const pending = await Review.countDocuments({ status: 'pending' });
          const approved = await Review.countDocuments({ status: 'approved' });
          return { total, pending, approved };
        })(),
      ]);

      // Contact trends last 7 days
      const last7 = new Date();
      last7.setDate(last7.getDate() - 6);
      last7.setHours(0, 0, 0, 0);
      const contactsByDay = await require('../models/Contact').aggregate([
        { $match: { createdAt: { $gte: last7 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);

      return res.json({
        role,
        cards: {
          totalUsers: userStats.total,
          activeUsers: userStats.active,
          newUsersToday: userStats.newUsersToday,
          newUsersMonth: userStats.newUsersMonth,
          totalContacts: contactStats.total,
          pendingContacts: contactStats.pending,
          todayContacts,
          monthContacts,
          totalOrders: orderStats.total,
          totalReviews: reviewStats.total,
          pendingReviews: reviewStats.pending,
        },
        userStats,
        contactStats,
        orderStats,
        recentContacts,
        contactsByDay,
      });
    }

    if (role === 'report_finance_analyst') {
      const today = startOfDay();
      const monthStart = startOfMonth();

      const [orderStatsAll, revenueTodayAgg, revenueMonthAgg, avgOrderValueAgg, taxesCount] = await Promise.all([
        getOrderStats({}),
        Order.aggregate([
          { $match: { createdAt: { $gte: today } } },
          { $group: { _id: null, revenue: { $sum: '$pricing.total' } } }
        ]),
        Order.aggregate([
          { $match: { createdAt: { $gte: monthStart } } },
          { $group: { _id: null, revenue: { $sum: '$pricing.total' } } }
        ]),
        Order.aggregate([
          { $group: { _id: null, avg: { $avg: '$pricing.total' } } }
        ]),
        Tax.countDocuments({}),
      ]);

      // Revenue/orders last 7 days
      const last7 = new Date();
      last7.setDate(last7.getDate() - 6);
      last7.setHours(0, 0, 0, 0);
      const [revenueByDay, ordersByDay] = await Promise.all([
        Order.aggregate([
          { $match: { createdAt: { $gte: last7 } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$pricing.total' } } },
          { $sort: { _id: 1 } },
        ]),
        Order.aggregate([
          { $match: { createdAt: { $gte: last7 } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
      ]);

      return res.json({
        role,
        cards: {
          totalRevenue: orderStatsAll.totalRevenue,
          revenueToday: revenueTodayAgg[0]?.revenue || 0,
          revenueThisMonth: revenueMonthAgg[0]?.revenue || 0,
          avgOrderValue: avgOrderValueAgg[0]?.avg || 0,
          taxes: taxesCount,
          totalOrders: orderStatsAll.total,
        },
        orderStats: orderStatsAll,
        revenueByDay,
        ordersByDay,
      });
    }

    if (role === 'delivery_boy') {
      const today = startOfDay();
      const deliveryBoyId = req.user.id;
      
      // Get assigned warehouses from both middleware and user profile
      const userWarehouseIds = req.user.assignedWarehouses ? req.user.assignedWarehouses.map(w => w._id.toString()) : [];
      const allWarehouseIds = [...new Set([...(assignedWarehouseStringIds || []), ...userWarehouseIds])];
      
      // Get all orders for this delivery boy (excluding cancelled/refunded from performance metrics)
      const [
        assignedWarehouses, 
        totalAssignedOrders, 
        totalAssignedOrdersExcludingCancelledRefunded,
        shippedOrders, 
        deliveredOrders, 
        todayDeliveries, 
        todayAssignedOrders,
        todayAssignedOrdersExcludingCancelledRefunded,
        cancelledOrders,
        refundedOrders,
        todayCancelledOrders,
        todayRefundedOrders,
        // New: cancellations/refunds after delivery (overall and today)
        cancelledAfterDelivery,
        refundedAfterDelivery,
        todayCancelledAfterDelivery,
        todayRefundedAfterDelivery
      ] = await Promise.all([
        Warehouse.find({ _id: { $in: allWarehouseIds } }).select('name address'),
        // All assigned orders (including cancelled/refunded for total count)
        Order.countDocuments({ 
          'assignedDeliveryBoy.id': deliveryBoyId 
        }),
        // Performance metric: Exclude cancelled and refunded orders
        Order.countDocuments({ 
          'assignedDeliveryBoy.id': deliveryBoyId,
          status: { $nin: ['cancelled', 'refunded'] }
        }),
        Order.countDocuments({ 
          'assignedDeliveryBoy.id': deliveryBoyId, 
          status: 'shipped' 
        }),
        Order.countDocuments({ 
          'assignedDeliveryBoy.id': deliveryBoyId, 
          status: 'delivered' 
        }),
        Order.find({ 
          'assignedDeliveryBoy.id': deliveryBoyId, 
          status: 'delivered',
          actualDeliveryDate: { $gte: today }
        })
        .sort({ actualDeliveryDate: -1 })
        .select('orderId customerInfo pricing deliveryInfo actualDeliveryDate status')
        .populate('items.productId', 'name image'),
        // All today's assigned orders (including cancelled/refunded for total count)
        Order.countDocuments({ 
          'assignedDeliveryBoy.id': deliveryBoyId,
          'assignedDeliveryBoy.assignedAt': { $gte: today }
        }),
        // Performance metric: Today's assigned orders excluding cancelled/refunded
        Order.countDocuments({ 
          'assignedDeliveryBoy.id': deliveryBoyId,
          'assignedDeliveryBoy.assignedAt': { $gte: today },
          status: { $nin: ['cancelled', 'refunded'] }
        }),
        // Cancelled orders stats
        Order.countDocuments({ 
          'assignedDeliveryBoy.id': deliveryBoyId, 
          status: 'cancelled' 
        }),
        // Refunded orders stats
        Order.countDocuments({ 
          'assignedDeliveryBoy.id': deliveryBoyId, 
          status: 'refunded' 
        }),
        // Today's cancelled orders
        Order.countDocuments({ 
          'assignedDeliveryBoy.id': deliveryBoyId,
          'assignedDeliveryBoy.assignedAt': { $gte: today },
          status: 'cancelled' 
        }),
        // Today's refunded orders
        Order.countDocuments({ 
          'assignedDeliveryBoy.id': deliveryBoyId,
          'assignedDeliveryBoy.assignedAt': { $gte: today },
          status: 'refunded' 
        }),
        // Cancelled after delivery (overall)
        Order.countDocuments({
          'assignedDeliveryBoy.id': deliveryBoyId,
          status: 'cancelled',
          actualDeliveryDate: { $ne: null }
        }),
        // Refunded after delivery (overall)
        Order.countDocuments({
          'assignedDeliveryBoy.id': deliveryBoyId,
          status: 'refunded',
          actualDeliveryDate: { $ne: null }
        }),
        // Today's cancelled after delivery (based on cancellation timestamp)
        Order.countDocuments({
          'assignedDeliveryBoy.id': deliveryBoyId,
          status: 'cancelled',
          actualDeliveryDate: { $ne: null },
          'cancellation.cancelledAt': { $gte: today }
        }),
        // Today's refunded after delivery (based on refund timestamp)
        Order.countDocuments({
          'assignedDeliveryBoy.id': deliveryBoyId,
          status: 'refunded',
          actualDeliveryDate: { $ne: null },
          'cancellation.refundedAt': { $gte: today }
        })
      ]);

      // Return stats for this delivery agent (assigned pickups)
      const [
        rRequested,
        rApproved,
        rPickupAssigned,
        rPickupRejected,
        rPickedUp,
        rReceived,
        rPartiallyRefunded,
        rRefunded,
        rRejected,
        rTodayAssigned
      ] = await Promise.all([
        Return.countDocuments({ 'assignedPickupAgent.id': deliveryBoyId, ...(allWarehouseIds.length ? { 'warehouseInfo.warehouseId': { $in: allWarehouseIds } } : {}), status: 'requested' }),
        Return.countDocuments({ 'assignedPickupAgent.id': deliveryBoyId, ...(allWarehouseIds.length ? { 'warehouseInfo.warehouseId': { $in: allWarehouseIds } } : {}), status: 'approved' }),
        Return.countDocuments({ 'assignedPickupAgent.id': deliveryBoyId, ...(allWarehouseIds.length ? { 'warehouseInfo.warehouseId': { $in: allWarehouseIds } } : {}), status: 'pickup_assigned' }),
        Return.countDocuments({ 'assignedPickupAgent.id': deliveryBoyId, ...(allWarehouseIds.length ? { 'warehouseInfo.warehouseId': { $in: allWarehouseIds } } : {}), status: 'pickup_rejected' }),
        Return.countDocuments({ 'assignedPickupAgent.id': deliveryBoyId, ...(allWarehouseIds.length ? { 'warehouseInfo.warehouseId': { $in: allWarehouseIds } } : {}), status: 'picked_up' }),
        Return.countDocuments({ 'assignedPickupAgent.id': deliveryBoyId, ...(allWarehouseIds.length ? { 'warehouseInfo.warehouseId': { $in: allWarehouseIds } } : {}), status: 'received' }),
        Return.countDocuments({ 'assignedPickupAgent.id': deliveryBoyId, ...(allWarehouseIds.length ? { 'warehouseInfo.warehouseId': { $in: allWarehouseIds } } : {}), status: 'partially_refunded' }).catch(() => 0),
        Return.countDocuments({ 'assignedPickupAgent.id': deliveryBoyId, ...(allWarehouseIds.length ? { 'warehouseInfo.warehouseId': { $in: allWarehouseIds } } : {}), status: 'refunded' }),
        Return.countDocuments({ 'assignedPickupAgent.id': deliveryBoyId, ...(allWarehouseIds.length ? { 'warehouseInfo.warehouseId': { $in: allWarehouseIds } } : {}), status: 'rejected' }),
        Return.countDocuments({ 'assignedPickupAgent.id': deliveryBoyId, ...(allWarehouseIds.length ? { 'warehouseInfo.warehouseId': { $in: allWarehouseIds } } : {}), createdAt: { $gte: today } })
      ]);

      return res.json({
        role,
        cards: {
          assignedOrders: totalAssignedOrders,
          assignedOrdersExcludingCancelledRefunded: totalAssignedOrdersExcludingCancelledRefunded,
          shippedOrders: shippedOrders,
          deliveredOrders: deliveredOrders,
          deliveredToday: todayDeliveries.length,
          todayAssignedOrders: todayAssignedOrders,
          todayAssignedOrdersExcludingCancelledRefunded: todayAssignedOrdersExcludingCancelledRefunded,
          pendingDeliveries: shippedOrders, // Shipped orders are pending delivery
          // Cancelled/Refunded after delivery stats (for performance/visibility)
          cancelledAfterDelivery,
          refundedAfterDelivery,
          todayCancelledAfterDelivery,
          todayRefundedAfterDelivery,
        },
        assignedWarehouses,
        todayDeliveries,
        returnStats: {
          requested: rRequested,
          approved: rApproved,
          pickup_assigned: rPickupAssigned,
          pickup_rejected: rPickupRejected,
          picked_up: rPickedUp,
          received: rReceived,
          partially_refunded: rPartiallyRefunded,
          refunded: rRefunded,
          rejected: rRejected,
          today: rTodayAssigned,
          total: rRequested + rApproved + rPickupAssigned + rPickupRejected + rPickedUp + rReceived + rPartiallyRefunded + rRefunded + rRejected
        }
      });
    }

    // Fallback - minimal info
    return res.json({ role, message: 'No dashboard defined for this role' });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard', details: err.message });
  }
};