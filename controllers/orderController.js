const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');

// Create a new order
const createOrder = async (req, res) => {
  try {
    const {
      items,
      customerInfo,
      pricing,
      promoCode,
      taxCalculation,
      deliveryInfo,
      paymentInfo,
      warehouseInfo,
      notes
    } = req.body;

    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order items are required' });
    }

    if (!customerInfo || !customerInfo.name || !customerInfo.phone) {
      return res.status(400).json({ error: 'Customer information is required' });
    }

    if (!deliveryInfo || !deliveryInfo.address) {
      return res.status(400).json({ error: 'Delivery address is required' });
    }

    if (!paymentInfo || !paymentInfo.method) {
      return res.status(400).json({ error: 'Payment method is required' });
    }

    if (!warehouseInfo || !warehouseInfo.warehouseId) {
      return res.status(400).json({ error: 'Warehouse information is required' });
    }

    // Generate unique order ID
    const orderId = Order.generateOrderId();

    // Set initial payment status based on payment method
    const initialPaymentStatus = paymentInfo.method === 'cod' ? 'pending' : 'prepaid';
    const updatedPaymentInfo = {
      ...paymentInfo,
      status: initialPaymentStatus
    };

    // Create the order
    const order = new Order({
      orderId,
      userId,
      items,
      customerInfo,
      pricing,
      promoCode,
      taxCalculation,
      deliveryInfo,
      paymentInfo: updatedPaymentInfo,
      warehouseInfo,
      notes,
      status: 'new'
    });

    // Add initial status history
    order.addStatusHistory('new', userId, 'Order placed');

    // Calculate total (validation)
    order.calculateTotal();

    // Save the order
    await order.save();

    // Clear user's cart after successful order creation
    try {
      await User.findByIdAndUpdate(userId, { $set: { cart: [] } });
    } catch (cartError) {
      console.error('Error clearing cart:', cartError);
      // Don't fail the order creation if cart clearing fails
    }

    // Populate the order with product details
    const populatedOrder = await Order.findById(order._id)
      .populate('userId', 'name email phone')
      .populate('items.productId', 'name price image category brand')
      .populate('items.brandId', 'name')
      .populate('items.categoryId', 'name');

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: populatedOrder
    });

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ 
      error: 'Failed to create order',
      details: error.message 
    });
  }
};

// Get user's orders
const getUserOrders = async (req, res) => {
  try {
    const userId = req.user?.id || req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email phone')
      .populate('items.productId', 'name price image category brand')
      .populate('items.brandId', 'name')
      .populate('items.categoryId', 'name');

    const totalOrders = await Order.countDocuments({ userId });

    res.json({
      success: true,
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
    console.error('Error fetching user orders:', error);
    res.status(500).json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
};

// Get all orders (Admin only)
const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const status = req.query.status;
    const search = req.query.search;
    
    // Build query
    let query = {};
    
    // For warehouse-specific roles, filter by assigned warehouses
    if (req.user.role === 'order_warehouse_management' && req.assignedWarehouseIds) {
      query['warehouseInfo.warehouseId'] = { $in: req.assignedWarehouseIds };
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'customerInfo.name': { $regex: search, $options: 'i' } },
        { 'customerInfo.email': { $regex: search, $options: 'i' } },
        { 'customerInfo.phone': { $regex: search, $options: 'i' } }
      ];
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email phone')
      .populate('items.productId', 'name price image category brand')
      .populate('items.brandId', 'name')
      .populate('items.categoryId', 'name');

    const totalOrders = await Order.countDocuments(query);

    // Get order statistics
    const stats = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$pricing.total' }
        }
      }
    ]);

    const orderStats = {
      total: totalOrders,
      new: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      refunded: 0,
      totalRevenue: 0
    };

    stats.forEach(stat => {
      orderStats[stat._id] = stat.count;
      orderStats.totalRevenue += stat.totalAmount;
    });

    res.json({
      success: true,
      orders,
      stats: orderStats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        hasNext: page < Math.ceil(totalOrders / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching all orders:', error);
    res.status(500).json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
};

// Get single order details
const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findOne({ orderId })
      .populate('userId', 'name email phone')
      .populate('items.productId', 'name price image category brand')
      .populate('items.brandId', 'name')
      .populate('items.categoryId', 'name')
      .populate('statusHistory.updatedBy', 'name email');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if user can access this order (user can only access their own orders, admin can access all)
    if (req.user.role !== 'admin' && order.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      order
    });

  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ 
      error: 'Failed to fetch order',
      details: error.message 
    });
  }
};

// Update order status (Admin only)
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, note, trackingNumber, carrier, trackingUrl } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['new', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Add status history
    order.addStatusHistory(status, req.user.id, note);

    // Update payment status based on order status and payment method
    if (status === 'cancelled' || status === 'refunded') {
      order.paymentInfo.status = 'refunded';
    } else if (status === 'delivered' && order.paymentInfo.method === 'cod') {
      order.paymentInfo.status = 'paid';
    } else if (order.paymentInfo.method === 'cod') {
      order.paymentInfo.status = 'pending';
    } else if (order.paymentInfo.method === 'online') {
      order.paymentInfo.status = 'prepaid';
    }

    // Update tracking information if provided
    if (trackingNumber) order.tracking.trackingNumber = trackingNumber;
    if (carrier) order.tracking.carrier = carrier;
    if (trackingUrl) order.tracking.trackingUrl = trackingUrl;

    // Set delivery date if status is delivered
    if (status === 'delivered' && !order.actualDeliveryDate) {
      order.actualDeliveryDate = new Date();
    }

    await order.save();

    const updatedOrder = await Order.findOne({ orderId })
      .populate('userId', 'name email phone')
      .populate('items.productId', 'name price image category brand')
      .populate('statusHistory.updatedBy', 'name email');

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order: updatedOrder
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ 
      error: 'Failed to update order status',
      details: error.message 
    });
  }
};

// Cancel order
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    
    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if user can cancel this order
    if (req.user.role !== 'admin' && order.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if order can be cancelled
    if (['delivered', 'cancelled', 'refunded'].includes(order.status)) {
      return res.status(400).json({ error: 'Order cannot be cancelled' });
    }

    // Update order status and cancellation info
    order.addStatusHistory('cancelled', req.user.id, reason || 'Order cancelled');
    order.cancellation = {
      reason: reason || 'Cancelled by user',
      cancelledAt: new Date(),
      cancelledBy: req.user.id
    };

    // Update payment status to refunded when order is cancelled
    order.paymentInfo.status = 'refunded';

    await order.save();

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order
    });

  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ 
      error: 'Failed to cancel order',
      details: error.message 
    });
  }
};

// Get orders by status (Admin)
const getOrdersByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const validStatuses = ['new', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Build query with warehouse filtering for specific roles
    let query = { status };
    
    // For warehouse-specific roles, filter by assigned warehouses
    if (req.user.role === 'order_warehouse_management' && req.assignedWarehouseIds) {
      query['warehouseInfo.warehouseId'] = { $in: req.assignedWarehouseIds };
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email phone')
      .populate('items.productId', 'name price image category brand')
      .populate('items.brandId', 'name')
      .populate('items.categoryId', 'name');

    const totalOrders = await Order.countDocuments(query);

    res.json({
      success: true,
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
    console.error('Error fetching orders by status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
};

module.exports = {
  createOrder,
  getUserOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  getOrdersByStatus
};