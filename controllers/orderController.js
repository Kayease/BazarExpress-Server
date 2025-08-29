const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const crypto = require('crypto');
const { sendDeliveryOTP } = require('../services/smsService');
const { updateProductStock, restoreProductStock } = require('../utils/stockManager');

// Store for delivery OTPs (in production, use Redis or database)
const deliveryOtpStore = {};

// Generate 4-digit OTP for delivery verification
function generateDeliveryOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

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
      .populate({
        path: 'items.productId',
        select: 'name price image category brand locationName variants attributes',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' }
        ]
      })
      .populate('items.brandId', 'name')
      .populate('items.categoryId', 'name');

    // After successful order creation, update product stock for each item
    try {
      await updateProductStock(items);
    } catch (stockErr) {
      console.error('Stock update error after order creation:', stockErr);
      // Do not fail the order response on stock update issues, but log for investigation
    }

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
      .populate({ path: 'items.productId', select: 'name price image category brand locationName variants attributes', populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: 'name' }] })
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
    const limit = parseInt(req.query.limit) || 100; // Increased default limit for admin view
    const skip = (page - 1) * limit;
    
    const status = req.query.status;
    const search = req.query.search;
    const warehouse = req.query.warehouse;
    const deliveryBoyId = req.query.deliveryBoyId;
    
    // Build query
    let query = {};
    
    // For delivery agents, only show their assigned orders
    if (req.user.role === 'delivery_boy') {
      query['assignedDeliveryBoy.id'] = req.user.id;
    }
    
    // For warehouse-specific roles, filter by assigned warehouses
    if (req.user.role === 'order_warehouse_management' && req.assignedWarehouseIds) {
      query['warehouseInfo.warehouseId'] = { $in: req.assignedWarehouseIds };
    }
    
    // Apply warehouse filter from frontend (for admin users)
    if (warehouse && warehouse !== 'all') {
      query['warehouseInfo.warehouseId'] = warehouse;
    }
    
    // Apply delivery agentfilter from frontend (only for non-delivery agents)
    if (req.user.role !== 'delivery_boy' && deliveryBoyId && deliveryBoyId !== 'all') {
      query['assignedDeliveryBoy.id'] = deliveryBoyId;
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
      .populate({ path: 'items.productId', select: 'name price image category brand locationName variants attributes', populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: 'name' }] })
      .populate('items.brandId', 'name')
      .populate('items.categoryId', 'name');

    const totalOrders = await Order.countDocuments(query);

    // Get order statistics (filtered by the same warehouse filter but without status filter)
    // We need to calculate stats for all statuses, not just the filtered status
    let statsQuery = {};
    
    // For delivery agents, only show their assigned orders in stats
    if (req.user.role === 'delivery_boy') {
      statsQuery['assignedDeliveryBoy.id'] = req.user.id;
    }
    
    // Apply warehouse filtering for stats (same as main query but without status filter)
    if (req.user.role === 'order_warehouse_management' && req.assignedWarehouseIds) {
      statsQuery['warehouseInfo.warehouseId'] = { $in: req.assignedWarehouseIds };
    }
    
    // Apply warehouse filter from frontend for stats (for admin users)
    if (warehouse && warehouse !== 'all') {
      statsQuery['warehouseInfo.warehouseId'] = warehouse;
    }
    
    // Apply delivery agentfilter from frontend for stats (only for non-delivery agents)
    if (req.user.role !== 'delivery_boy' && deliveryBoyId && deliveryBoyId !== 'all') {
      statsQuery['assignedDeliveryBoy.id'] = deliveryBoyId;
    }
    
    const statsAggregation = [
      { $match: statsQuery }, // Apply warehouse filter but not status filter for stats
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$pricing.total' }
        }
      }
    ];
    
    const stats = await Order.aggregate(statsAggregation);

    // Calculate total orders for stats (should match the sum of all status counts)
    const totalOrdersForStats = await Order.countDocuments(statsQuery);

    const orderStats = {
      total: totalOrdersForStats,
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
      .populate({ path: 'items.productId', select: 'name price image category brand locationName variants attributes', populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: 'name' }] })
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
      
      // Restore product stock when order is cancelled or refunded
      try {
        await restoreProductStock(order.items);
      } catch (stockErr) {
        console.error('Stock restore error after order cancellation/refund:', stockErr);
        // Log error but don't fail the status update
      }
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
      .populate({ path: 'items.productId', select: 'name price image category brand locationName variants attributes', populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: 'name' }] })
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

    // Restore product stock when order is cancelled
    try {
      await restoreProductStock(order.items);
    } catch (stockErr) {
      console.error('Stock restore error after order cancellation:', stockErr);
      // Log error but don't fail the cancellation
    }

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
    const search = req.query.search;
    const warehouse = req.query.warehouse;

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
    
    // For delivery agent s, filter by their assigned orders
    if (req.user.role === 'delivery_boy') {
      query['assignedDeliveryBoy.id'] = req.user.id;
    }
    
    // Apply delivery agentfilter from query params (for admin/warehouse managers)
    if (req.query.deliveryBoyId && req.query.deliveryBoyId !== 'all') {
      query['assignedDeliveryBoy.id'] = req.query.deliveryBoyId;
    }
    
    // Apply warehouse filter from frontend (for admin users)
    if (warehouse && warehouse !== 'all') {
      query['warehouseInfo.warehouseId'] = warehouse;
    }
    
    // Apply search filter
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
      .populate({ path: 'items.productId', select: 'name price image category brand locationName variants attributes', populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: 'name' }] })
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

// Generate delivery OTP for order status change to delivered
const generateDeliveryOtpForOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if user has permission to update order status
    if (req.user.role !== 'admin' && req.user.role !== 'order_warehouse_management' && req.user.role !== 'delivery_boy') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // For warehouse-specific roles, check warehouse access
    if (req.user.role === 'order_warehouse_management' && req.assignedWarehouseIds) {
      if (!req.assignedWarehouseIds.includes(order.warehouseInfo.warehouseId)) {
        return res.status(403).json({ error: 'Access denied for this warehouse' });
      }
    }

    // For delivery agents, check if the order is assigned to them
    if (req.user.role === 'delivery_boy') {
      // Check both id and _id formats for compatibility
      const assignedId = order.assignedDeliveryBoy?.id || order.assignedDeliveryBoy?._id;
      const userId = req.user.id || req.user._id?.toString();
      
      // Convert both to strings for comparison
      const assignedIdStr = assignedId?.toString();
      const userIdStr = userId?.toString();
      const reqUserIdStr = req.user.id?.toString();
      const reqUserObjectIdStr = req.user._id?.toString();
      
      if (!assignedId) {
        return res.status(403).json({ 
          error: 'This order is not assigned to any delivery agent. Please contact admin to assign a delivery agent first.'
        });
      }
      
      // Check if any of the user ID formats match the assigned ID
      const isMatch = assignedIdStr === userIdStr || 
                     assignedIdStr === reqUserIdStr || 
                     assignedIdStr === reqUserObjectIdStr;
      
      if (!isMatch) {
        return res.status(403).json({ 
          error: 'This order is assigned to a different delivery agent'
        });
      }
    }

    // Generate OTP
    const otp = generateDeliveryOtp();
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    // Store OTP with 10 minutes expiry
    deliveryOtpStore[sessionId] = {
      orderId,
      otp,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      userId: req.user.id
    };

    // Send OTP to customer's phone
    const customerPhone = order.customerInfo.phone;
    console.log(`Delivery OTP for order ${orderId}: ${otp}`); // For testing - remove in production
    
    try {
      const smsSuccess = await sendDeliveryOTP(customerPhone, otp, orderId);
      
      if (smsSuccess) {
        console.log(`Delivery OTP sent successfully to customer ${customerPhone} for order ${orderId}`);
        res.json({
          success: true,
          sessionId,
          message: 'Delivery OTP generated and sent to customer via SMS'
        });
      } else {
        console.log(`Failed to send SMS to customer ${customerPhone}, but OTP generated for order ${orderId}`);
        res.json({
          success: true,
          sessionId,
          message: 'Delivery OTP generated successfully (SMS delivery failed - check server logs)'
        });
      }
    } catch (smsError) {
      console.error('SMS sending error:', smsError);
      res.json({
        success: true,
        sessionId,
        message: 'Delivery OTP generated successfully (SMS delivery failed - check server logs)'
      });
    }

  } catch (error) {
    console.error('Error generating delivery OTP:', error);
    res.status(500).json({ 
      error: 'Failed to generate delivery OTP',
      details: error.message 
    });
  }
};

// Verify delivery OTP and update order status to delivered
const verifyDeliveryOtpAndUpdateStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { otp, sessionId, note } = req.body;
    
    if (!otp || !sessionId) {
      return res.status(400).json({ error: 'OTP and session ID are required' });
    }

    // Check OTP validity
    const otpRecord = deliveryOtpStore[sessionId];
    if (!otpRecord || otpRecord.orderId !== orderId || otpRecord.otp !== otp || Date.now() > otpRecord.expires) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Check if the user is the same who generated the OTP
    if (otpRecord.userId !== req.user.id) {
      return res.status(403).json({ error: 'OTP can only be verified by the user who generated it' });
    }

    // Clean up OTP
    delete deliveryOtpStore[sessionId];

    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if user has permission to update order status
    if (req.user.role !== 'admin' && req.user.role !== 'order_warehouse_management' && req.user.role !== 'delivery_boy') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // For warehouse-specific roles, check warehouse access
    if (req.user.role === 'order_warehouse_management' && req.assignedWarehouseIds) {
      if (!req.assignedWarehouseIds.includes(order.warehouseInfo.warehouseId)) {
        return res.status(403).json({ error: 'Access denied for this warehouse' });
      }
    }

    // For delivery agents, check if the order is assigned to them
    if (req.user.role === 'delivery_boy') {
      // Check both id and _id formats for compatibility
      const assignedId = order.assignedDeliveryBoy?.id || order.assignedDeliveryBoy?._id;
      const userId = req.user.id || req.user._id?.toString();
      
      // Convert both to strings for comparison
      const assignedIdStr = assignedId?.toString();
      const userIdStr = userId?.toString();
      const reqUserIdStr = req.user.id?.toString();
      const reqUserObjectIdStr = req.user._id?.toString();
      
      // Check if any of the user ID formats match the assigned ID
      const isMatch = assignedIdStr === userIdStr || 
                     assignedIdStr === reqUserIdStr || 
                     assignedIdStr === reqUserObjectIdStr;
      
      if (!assignedId) {
        return res.status(403).json({ error: 'This order is not assigned to any delivery agent' });
      }
      
      if (!isMatch) {
        return res.status(403).json({ error: 'Access denied - order not assigned to you' });
      }
    }

    // Check if order can be marked as delivered
    if (order.status === 'delivered') {
      return res.status(400).json({ error: 'Order is already delivered' });
    }

    if (['cancelled', 'refunded'].includes(order.status)) {
      return res.status(400).json({ error: 'Cannot mark cancelled or refunded order as delivered' });
    }

    // Update order status to delivered
    order.addStatusHistory('delivered', req.user.id, note || 'Order delivered - OTP verified');

    // Update payment status for COD orders
    if (order.paymentInfo.method === 'cod') {
      order.paymentInfo.status = 'paid';
    }

    // Set delivery date
    if (!order.actualDeliveryDate) {
      order.actualDeliveryDate = new Date();
    }

    await order.save();

    const updatedOrder = await Order.findOne({ orderId })
      .populate('userId', 'name email phone')
      .populate({ path: 'items.productId', select: 'name price image category brand locationName variants attributes', populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: 'name' }] })
      .populate('statusHistory.updatedBy', 'name email');

    res.json({
      success: true,
      message: 'Order status updated to delivered successfully',
      order: updatedOrder
    });

  } catch (error) {
    console.error('Error verifying delivery OTP:', error);
    res.status(500).json({ 
      error: 'Failed to verify delivery OTP',
      details: error.message 
    });
  }
};

// Assign delivery agentto order
const assignDeliveryBoy = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryBoyId, deliveryBoyName, deliveryBoyPhone } = req.body;

    // Check if user has permission to assign delivery agents
    if (!['admin', 'order_warehouse_management'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if order is in a valid status for delivery agentassignment
    // Allow assignment for orders that are "processing", "confirmed", or "shipped"
    const validStatuses = ['processing', 'confirmed', 'shipped'];
    if (!validStatuses.includes(order.status)) {
      return res.status(400).json({ 
        error: `Order must be in processing status to assign delivery agent ` 
      });
    }

    // Update order with delivery agentassignment
    order.assignedDeliveryBoy = {
      id: deliveryBoyId,
      name: deliveryBoyName,
      phone: deliveryBoyPhone,
      assignedAt: new Date(),
      assignedBy: req.user.id
    };

    // Add status history for delivery agent assignment
    order.addStatusHistory(order.status, req.user.id, `Assigned to delivery agent: ${deliveryBoyName}`);

    await order.save();

    res.json({
      success: true,
      message: 'Delivery Agent assigned successfully',
      order
    });

  } catch (error) {
    console.error('Error assigning delivery agent:', error);
    res.status(500).json({ 
      error: 'Failed to assign delivery agent',
      details: error.message 
    });
  }
};



// Get order statistics
const getOrderStats = async (req, res) => {
  try {
    const warehouse = req.query.warehouse;
    
    // Build query based on user role and warehouse access
    let statsQuery = {};
    
    // Apply warehouse filtering for stats
    if (req.user.role === 'order_warehouse_management' && req.assignedWarehouseIds) {
      statsQuery['warehouseInfo.warehouseId'] = { $in: req.assignedWarehouseIds };
    }
    
    // Apply warehouse filter from frontend (for admin users)
    if (warehouse && warehouse !== 'all') {
      statsQuery['warehouseInfo.warehouseId'] = warehouse;
    }
    
    const statsAggregation = [
      { $match: statsQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$pricing.total' }
        }
      }
    ];
    
    const stats = await Order.aggregate(statsAggregation);

    const orderStats = {
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
      stats: orderStats
    });

  } catch (error) {
    console.error('Error fetching order stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch order statistics',
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
  getOrdersByStatus,
  generateDeliveryOtpForOrder,
  verifyDeliveryOtpAndUpdateStatus,
  assignDeliveryBoy,
  getOrderStats
};
