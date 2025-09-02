const Return = require('../models/Return');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const crypto = require('crypto');
const { sendPickupOTP } = require('../services/smsService');

// Store for pickup OTPs (in production, use Redis or database)
const pickupOtpStore = {};

// Generate 4-digit OTP for pickup verification
function generatePickupOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Create a new return request
const createReturnRequest = async (req, res) => {
  try {
    const { orderId, items, returnReason, pickupAddress, pickupInstructions } = req.body;
    const userId = req.user.id;

    // Validate the order exists and belongs to the user
    const order = await Order.findOne({ orderId, userId })
      .populate({ 
        path: 'items.productId', 
        select: 'name price image category brand locationName variants attributes returnable returnWindow',
        populate: [
          { path: 'brand', select: 'name' }, 
          { path: 'category', select: 'name' }
        ] 
      });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if order is delivered
    if (order.status !== 'delivered') {
      return res.status(400).json({ error: 'Only delivered orders can be returned' });
    }

    // Validate return items exist in the order
    const orderItemIds = order.items.map(item => item._id.toString());
    const invalidItems = items.filter(item => !orderItemIds.includes(item.itemId));
    if (invalidItems.length > 0) {
      return res.status(400).json({ error: 'Some items are not part of this order' });
    }

    // Check if items are still within return window
    const deliveryDate = order.actualDeliveryDate || order.deliveredAt;
    if (!deliveryDate) {
      return res.status(400).json({ error: 'Delivery date not found for this order' });
    }

    const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 3600 * 24));
    
    console.log('🔍 Return window validation:', {
      deliveryDate,
      currentDate: new Date().toISOString(),
      daysSinceDelivery
    });
    
    // Validate each item's return eligibility
    for (const returnItem of items) {
      const orderItem = order.items.find(item => item._id.toString() === returnItem.itemId);
      if (!orderItem) continue;

      // Check if item is returnable (check item first, then product)
      const itemReturnable = orderItem.returnable !== undefined ? orderItem.returnable : orderItem.productId?.returnable;
      const isReturnable = itemReturnable === true;
      if (!isReturnable) {
        return res.status(400).json({ 
          error: `Item "${orderItem.name}" is not returnable` 
        });
      }

      // Check return window
      const returnWindow = orderItem.returnWindow || orderItem.productId?.returnWindow;
      
      console.log(`🔍 Item "${orderItem.name}" return window check:`, {
        itemReturnWindow: orderItem.returnWindow,
        productReturnWindow: orderItem.productId?.returnWindow,
        finalReturnWindow: returnWindow,
        daysSinceDelivery,
        isExpired: daysSinceDelivery > returnWindow,
        itemReturnable: orderItem.returnable,
        productReturnable: orderItem.productId?.returnable,
        finalReturnable: itemReturnable,
        isReturnableResult: isReturnable,
        orderItem: {
          name: orderItem.name,
          returnable: orderItem.returnable,
          returnWindow: orderItem.returnWindow,
          productId: {
            _id: orderItem.productId?._id,
            name: orderItem.productId?.name,
            returnable: orderItem.productId?.returnable,
            returnWindow: orderItem.productId?.returnWindow
          }
        }
      });
      
      if (!returnWindow || daysSinceDelivery > returnWindow) {
        return res.status(400).json({ 
          error: `Return window expired for item "${orderItem.name}". Days since delivery: ${daysSinceDelivery}, Return window: ${returnWindow} days` 
        });
      }
    }

    // Create return items array
    const returnItems = items.map(returnItem => {
      const orderItem = order.items.find(item => item._id.toString() === returnItem.itemId);
      return {
        productId: orderItem.productId,
        name: orderItem.name,
        price: orderItem.price,
        quantity: returnItem.quantity || orderItem.quantity,
        image: orderItem.image,
        category: orderItem.category,
        brand: orderItem.brand,
        variantId: orderItem.variantId,
        variantName: orderItem.variantName,
        selectedVariant: orderItem.selectedVariant,
        returnReason: returnItem.reason || returnReason,
        returnStatus: 'requested'
      };
    });

    // Generate return ID
    const returnId = Return.generateReturnId();

    // Create return request
    const returnRequest = new Return({
      returnId,
      orderId: order.orderId,
      orderObjectId: order._id,
      userId,
      customerInfo: {
        name: order.customerInfo.name,
        email: order.customerInfo.email,
        phone: order.customerInfo.phone
      },
      items: returnItems,
      returnReason,
      pickupInfo: {
        address: pickupAddress,
        pickupInstructions
      },
      warehouseInfo: {
        warehouseId: order.warehouseInfo.warehouseId,
        warehouseName: order.warehouseInfo.warehouseName,
        warehouseAddress: order.warehouseInfo.warehouseAddress
      }
    });

    // Add initial status history
    returnRequest.addStatusHistory('requested', userId, 'Return request created by customer');

    await returnRequest.save();

    res.status(201).json({
      message: 'Return request created successfully',
      returnRequest: {
        returnId: returnRequest.returnId,
        status: returnRequest.status,
        items: returnRequest.items.length,
        createdAt: returnRequest.createdAt
      }
    });

  } catch (error) {
    console.error('Error creating return request:', error);
    res.status(500).json({ error: 'Failed to create return request' });
  }
};

// Get all return requests (Admin)
const getAllReturnRequests = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      warehouseId, 
      assignedAgent,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (warehouseId && warehouseId !== 'all') {
      filter['warehouseInfo.warehouseId'] = warehouseId;
    }
    if (assignedAgent && assignedAgent !== 'all') {
      if (assignedAgent === 'unassigned') {
        filter['assignedPickupAgent.id'] = { $exists: false };
      } else {
        filter['assignedPickupAgent.id'] = assignedAgent;
      }
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [returns, totalCount] = await Promise.all([
      Return.find(filter)
        .populate('userId', 'name email phone')
        .populate('assignedPickupAgent.id', 'name phone')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Return.countDocuments(filter)
    ]);

    // Get return statistics
    const stats = await Return.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusStats = {
      requested: 0,
      approved: 0,
      pickup_assigned: 0,
      pickup_rejected: 0,
      picked_up: 0,
      received: 0,
      refunded: 0,
      rejected: 0
    };

    stats.forEach(stat => {
      statusStats[stat._id] = stat.count;
    });

    res.json({
      returns,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + returns.length < totalCount,
        hasPrev: parseInt(page) > 1
      },
      stats: statusStats
    });

  } catch (error) {
    console.error('Error fetching return requests:', error);
    res.status(500).json({ error: 'Failed to fetch return requests' });
  }
};

// Get return requests for delivery agent
const getDeliveryAgentReturns = async (req, res) => {
  try {
    const deliveryAgentId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;

    // Build filter for assigned returns
    const filter = {
      'assignedPickupAgent.id': deliveryAgentId
    };

    if (status && status !== 'all') {
      filter.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [returns, totalCount] = await Promise.all([
      Return.find(filter)
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Return.countDocuments(filter)
    ]);

    res.json({
      returns,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + returns.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Error fetching delivery agent returns:', error);
    res.status(500).json({ error: 'Failed to fetch return requests' });
  }
};

// Update return status (Admin/Warehouse Manager)
const updateReturnStatus = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { status, note, assignedPickupAgent } = req.body;
    const updatedBy = req.user.id;

    const returnRequest = await Return.findOne({ returnId });
    if (!returnRequest) {
      return res.status(404).json({ error: 'Return request not found' });
    }

    // Handle pickup agent assignment
    if (status === 'pickup_assigned' && assignedPickupAgent) {
      const deliveryAgent = await User.findById(assignedPickupAgent);
      if (!deliveryAgent || deliveryAgent.role !== 'delivery_boy') {
        return res.status(400).json({ error: 'Invalid delivery agent' });
      }

      returnRequest.assignedPickupAgent = {
        id: deliveryAgent._id,
        name: deliveryAgent.name,
        phone: deliveryAgent.phone,
        assignedAt: new Date(),
        assignedBy: updatedBy
      };

      // Generate pickup OTP
      const otp = generatePickupOtp();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      returnRequest.pickupOtp = {
        otp,
        generatedAt: new Date(),
        expiresAt,
        verified: false
      };

      // Store OTP for verification
      pickupOtpStore[returnId] = {
        otp,
        expiresAt,
        customerId: returnRequest.userId.toString()
      };

      // Send OTP to customer
      try {
        await sendPickupOTP(returnRequest.customerInfo.phone, otp, returnId);
      } catch (smsError) {
        console.error('Failed to send pickup OTP:', smsError);
        // Continue with assignment even if SMS fails
      }
    }

    // Add status history and update status
    returnRequest.addStatusHistory(status, updatedBy, note);

    await returnRequest.save();

    res.json({
      message: 'Return status updated successfully',
      returnRequest: {
        returnId: returnRequest.returnId,
        status: returnRequest.status,
        assignedPickupAgent: returnRequest.assignedPickupAgent
      }
    });

  } catch (error) {
    console.error('Error updating return status:', error);
    res.status(500).json({ error: 'Failed to update return status' });
  }
};

// Delivery agent actions (Accept/Reject pickup)
const updatePickupStatus = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { action, note } = req.body; // action: 'accept', 'reject', 'picked_up'
    const deliveryAgentId = req.user.id;

    const returnRequest = await Return.findOne({ returnId });
    if (!returnRequest) {
      return res.status(404).json({ error: 'Return request not found' });
    }

    // Verify the return is assigned to this delivery agent
    if (!returnRequest.assignedPickupAgent?.id || 
        returnRequest.assignedPickupAgent.id.toString() !== deliveryAgentId) {
      return res.status(403).json({ error: 'This return is not assigned to you' });
    }

    let newStatus;
    let statusNote = note || '';

    switch (action) {
      case 'reject':
        newStatus = 'pickup_rejected';
        statusNote = statusNote || 'Pickup rejected by delivery agent';
        // Clear assigned agent
        returnRequest.assignedPickupAgent = undefined;
        break;
      case 'picked_up':
        newStatus = 'picked_up';
        statusNote = statusNote || 'Items picked up successfully';
        returnRequest.actualPickupDate = new Date();
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    // Add status history and update status
    returnRequest.addStatusHistory(newStatus, deliveryAgentId, statusNote);

    await returnRequest.save();

    res.json({
      message: `Return ${action} successfully`,
      returnRequest: {
        returnId: returnRequest.returnId,
        status: returnRequest.status,
        actualPickupDate: returnRequest.actualPickupDate
      }
    });

  } catch (error) {
    console.error('Error updating pickup status:', error);
    res.status(500).json({ error: 'Failed to update pickup status' });
  }
};

// Verify pickup OTP
const verifyPickupOtp = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { otp } = req.body;

    const returnRequest = await Return.findOne({ returnId });
    if (!returnRequest) {
      return res.status(404).json({ error: 'Return request not found' });
    }

    // Check if OTP exists and is valid
    const storedOtpData = pickupOtpStore[returnId];
    if (!storedOtpData) {
      return res.status(400).json({ error: 'No OTP found for this return' });
    }

    if (new Date() > storedOtpData.expiresAt) {
      delete pickupOtpStore[returnId];
      return res.status(400).json({ error: 'OTP has expired' });
    }

    if (storedOtpData.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Mark OTP as verified
    returnRequest.pickupOtp.verified = true;
    await returnRequest.save();

    // Clean up OTP store
    delete pickupOtpStore[returnId];

    res.json({
      message: 'OTP verified successfully',
      verified: true
    });

  } catch (error) {
    console.error('Error verifying pickup OTP:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
};

// Process refund for returned items (Admin/Warehouse Manager)
const processRefund = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { items, refundMethod, refundDetails } = req.body;
    const processedBy = req.user.id;

    console.log('🔍 Processing refund for return:', returnId);
    console.log('📦 Refund request data:', {
      items,
      refundMethod,
      refundDetails,
      processedBy
    });

    // Validate request data
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided for refund' });
    }

    if (!refundMethod) {
      return res.status(400).json({ error: 'Refund method is required' });
    }

    // Validate each item has required fields
    for (const item of items) {
      if (!item.itemId) {
        return res.status(400).json({ error: 'Item ID is required for each refund item' });
      }
      if (typeof item.refundAmount !== 'number' || item.refundAmount <= 0) {
        return res.status(400).json({ error: 'Valid refund amount is required for each item' });
      }
    }

    const returnRequest = await Return.findOne({ returnId });
    if (!returnRequest) {
      return res.status(404).json({ error: 'Return request not found' });
    }

    console.log('📋 Return request found:', {
      returnId: returnRequest.returnId,
      status: returnRequest.status,
      itemsCount: returnRequest.items.length,
      items: returnRequest.items.map(item => ({
        _id: item._id,
        name: item.name,
        returnStatus: item.returnStatus,
        price: item.price,
        quantity: item.quantity
      }))
    });

    if (returnRequest.status !== 'received') {
      return res.status(400).json({ 
        error: `Return must be received before processing refund. Current status: ${returnRequest.status}` 
      });
    }

    // Update individual item statuses and refund amounts
    let totalRefundAmount = 0;
    items.forEach(item => {
      console.log('🔍 Processing refund item:', {
        itemId: item.itemId,
        refundAmount: item.refundAmount
      });
      
      const returnItem = returnRequest.items.find(ri => ri._id.toString() === item.itemId);
      console.log('🎯 Found return item:', {
        found: !!returnItem,
        returnItemId: returnItem?._id,
        returnItemName: returnItem?.name,
        currentStatus: returnItem?.returnStatus
      });
      
      if (returnItem) {
        returnItem.returnStatus = 'refunded';
        returnItem.refundAmount = item.refundAmount;
        returnItem.refundedAt = new Date();
        totalRefundAmount += item.refundAmount;
        console.log('✅ Updated return item:', {
          name: returnItem.name,
          refundAmount: item.refundAmount,
          newStatus: returnItem.returnStatus
        });
      } else {
        console.log('❌ Return item not found for itemId:', item.itemId);
      }
    });

    console.log('💰 Total refund amount:', totalRefundAmount);

    // Update refund information
    returnRequest.refundInfo = {
      totalRefundAmount,
      refundMethod,
      refundStatus: 'processed',
      refundedAt: new Date(),
      refundDetails: refundDetails || {}
    };

    // Check if all items are refunded
    const allItemsRefunded = returnRequest.items.every(item => item.returnStatus === 'refunded');
    const newStatus = allItemsRefunded ? 'refunded' : 'partially_refunded';

    // Add status history
    returnRequest.addStatusHistory(newStatus, processedBy, 
      `Refund processed: ₹${totalRefundAmount} via ${refundMethod} for ${items.length} item(s)`);

    await returnRequest.save();

    // TODO: Integrate with payment gateway for actual refund processing
    // For now, we'll just mark it as processed

    res.json({
      message: 'Refund processed successfully',
      refundAmount: totalRefundAmount,
      returnRequest: {
        returnId: returnRequest.returnId,
        status: returnRequest.status,
        refundInfo: returnRequest.refundInfo
      }
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
};

// Get user's return requests
const getUserReturns = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;

    const filter = { userId };
    if (status && status !== 'all') {
      filter.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [returns, totalCount] = await Promise.all([
      Return.find(filter)
        .populate('assignedPickupAgent.id', 'name phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Return.countDocuments(filter)
    ]);

    res.json({
      returns,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + returns.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Error fetching user returns:', error);
    res.status(500).json({ error: 'Failed to fetch return requests' });
  }
};

// Get single return request details
const getReturnDetails = async (req, res) => {
  try {
    const { returnId } = req.params;

    const returnRequest = await Return.findOne({ returnId })
      .populate('userId', 'name email phone')
      .populate('assignedPickupAgent.id', 'name phone')
      .populate('statusHistory.updatedBy', 'name role');

    if (!returnRequest) {
      return res.status(404).json({ error: 'Return request not found' });
    }

    // Check if user has access to this return
    if (req.user.role === 'customer' && returnRequest.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ returnRequest });

  } catch (error) {
    console.error('Error fetching return details:', error);
    res.status(500).json({ error: 'Failed to fetch return details' });
  }
};

module.exports = {
  createReturnRequest,
  getAllReturnRequests,
  getDeliveryAgentReturns,
  updateReturnStatus,
  updatePickupStatus,
  verifyPickupOtp,
  processRefund,
  getUserReturns,
  getReturnDetails
};