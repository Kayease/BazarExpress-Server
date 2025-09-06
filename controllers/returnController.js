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
    const { orderId, items, returnReason, pickupAddress, pickupInstructions, refundPreference } = req.body;
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

    // Prevent duplicate return requests for the same order items (ever)
    const requestedOrderItemIds = items.map(it => it.itemId);
    const existingForItems = await Return.find({
      orderId: order.orderId,
      'items.orderItemId': { $in: requestedOrderItemIds }
    }).select('_id items.orderItemId status');
    if (existingForItems && existingForItems.length > 0) {
      return res.status(400).json({ error: 'Return request already exists for one or more selected items and cannot be submitted again' });
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
      
      // Extract category name properly
      let categoryName = orderItem.category;
      if (orderItem.productId && orderItem.productId.category && orderItem.productId.category.name) {
        categoryName = orderItem.productId.category.name;
      } else if (typeof orderItem.category === 'object' && orderItem.category.name) {
        categoryName = orderItem.category.name;
      }
      
      // Extract brand name properly
      let brandName = orderItem.brand;
      if (orderItem.productId && orderItem.productId.brand && orderItem.productId.brand.name) {
        brandName = orderItem.productId.brand.name;
      } else if (typeof orderItem.brand === 'object' && orderItem.brand.name) {
        brandName = orderItem.brand.name;
      }
      
      return {
        productId: orderItem.productId,
        name: orderItem.name,
        price: orderItem.price,
        quantity: returnItem.quantity || orderItem.quantity,
        image: orderItem.image,
        category: categoryName,
        brand: brandName,
        // Include tax information from order item
        priceIncludesTax: orderItem.priceIncludesTax,
        tax: orderItem.tax,
        variantId: orderItem.variantId,
        variantName: orderItem.variantName,
        selectedVariant: orderItem.selectedVariant,
        orderItemId: orderItem._id,
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
      },
      // Store user's selected refund preference
      refundPreference: refundPreference && typeof refundPreference === 'object' ? {
        method: refundPreference.method,
        upiId: refundPreference.upiId,
        bankDetails: refundPreference.bankDetails || {}
      } : undefined
    });

    // Add initial status history
    returnRequest.addStatusHistory('requested', userId, 'Return request created by Customer');

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

    // Enforce warehouse access for warehouse managers when "all" is selected
    if ((!warehouseId || warehouseId === 'all') && req.user && req.user.role !== 'admin') {
      if (Array.isArray(req.assignedWarehouseIds) && req.assignedWarehouseIds.length > 0) {
        filter['warehouseInfo.warehouseId'] = { $in: req.assignedWarehouseIds };
      }
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
    const matchForStats = { ...filter };
    const stats = await Return.aggregate([
      { $match: matchForStats },
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
    const { page = 1, limit = 10, status, warehouseId } = req.query;

    // Build filter for assigned returns
    const filter = {
      'assignedPickupAgent.id': deliveryAgentId
    };

    if (status && status !== 'all') {
      filter.status = status;
    }

    // Optional warehouse filtering for delivery agents
    if (warehouseId && warehouseId !== 'all') {
      filter['warehouseInfo.warehouseId'] = warehouseId;
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
    const { status, note, assignedPickupAgent, refundedAmount } = req.body;
    const updatedBy = req.user.id;

    const returnRequest = await Return.findOne({ returnId });
    if (!returnRequest) {
      return res.status(404).json({ error: 'Return request not found' });
    }

    // Prevent changing from partially_refunded to refunded
    if (returnRequest.status === 'partially_refunded' && status === 'refunded') {
      return res.status(400).json({ 
        error: 'Cannot change status from partially_refunded to refunded. Use the refund processing feature to complete remaining refunds.' 
      });
    }

    // Prevent changing from refunded to any other status
    if (returnRequest.status === 'refunded') {
      return res.status(400).json({ 
        error: 'Cannot change status from refunded. This return is already fully processed.' 
      });
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

      // Log OTP for debugging
      console.log(`[Return] Pickup OTP for ${returnId}: ${otp}`);
    }

    // Handle refunded amount for partial and full refunds
    if (status === 'partially_refunded' || status === 'refunded') {
      if (refundedAmount && refundedAmount > 0) {
        returnRequest.refundedAmount = refundedAmount;
      } else if (status === 'refunded') {
        // For full refunds, if no specific amount provided, calculate from return items
        if (returnRequest.refundInfo?.totalRefundAmount && returnRequest.refundInfo.totalRefundAmount > 0) {
          returnRequest.refundedAmount = returnRequest.refundInfo.totalRefundAmount;
        } else {
          // Calculate total refund amount from return items
          const totalRefundAmount = returnRequest.items.reduce((total, item) => {
            return total + (item.refundAmount || (item.price * item.quantity));
          }, 0);
          returnRequest.refundedAmount = totalRefundAmount;
        }
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
        // Enforce OTP verification for delivery agents
        if (!returnRequest.pickupOtp?.verified) {
          return res.status(400).json({ error: 'Pickup OTP must be verified before marking as picked up' });
        }
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

// Explicitly resend/generate pickup OTP (Admin/Warehouse)
const resendPickupOtp = async (req, res) => {
  try {
    const { returnId } = req.params;
    const updatedBy = req.user.id;

    const returnRequest = await Return.findOne({ returnId });
    if (!returnRequest) {
      return res.status(404).json({ error: 'Return request not found' });
    }

    // Allow OTP generation for pickup_assigned status or when pickup agent is assigned
    if (returnRequest.status !== 'pickup_assigned' && !returnRequest.assignedPickupAgent?.id) {
      return res.status(400).json({ error: 'Return must be in pickup_assigned status or have a pickup agent assigned' });
    }

    const otp = generatePickupOtp();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    returnRequest.pickupOtp = {
      otp,
      generatedAt: new Date(),
      expiresAt,
      verified: false
    };

    pickupOtpStore[returnId] = {
      otp,
      expiresAt,
      customerId: returnRequest.userId.toString()
    };

    try {
      await sendPickupOTP(returnRequest.customerInfo.phone, otp, returnId);
    } catch (smsError) {
      console.error('Failed to send pickup OTP:', smsError);
    }

    console.log(`[Return] Pickup OTP for ${returnId}: ${otp}`);

    // Optional: add history entry for audit
    returnRequest.addStatusHistory(returnRequest.status, updatedBy, 'Pickup OTP resent');
    await returnRequest.save();

    res.json({ success: true, message: 'Pickup OTP resent successfully' });
  } catch (error) {
    console.error('Error resending pickup OTP:', error);
    res.status(500).json({ error: 'Failed to resend pickup OTP' });
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
      // Force admin to use customer-selected method when available
      refundMethod: returnRequest.refundPreference?.method === 'upi' ? 'original_payment' : (refundMethod || 'original_payment'),
      refundStatus: 'processed',
      refundedAt: new Date(),
      refundDetails: refundDetails || {}
    };

    // Set the refunded amount
    returnRequest.refundedAmount = totalRefundAmount;

    // Check if all items are refunded
    const allItemsRefunded = returnRequest.items.every(item => item.returnStatus === 'refunded');
    const newStatus = allItemsRefunded ? 'refunded' : 'partially_refunded';

    // Add status history
    returnRequest.addStatusHistory(newStatus, processedBy, 
      `Refund processed: ₹${totalRefundAmount} via ${refundMethod} for ${items.length} item(s)`);

    await returnRequest.save();

    // Also mark the corresponding order items as refunded
    const order = await Order.findById(returnRequest.orderObjectId);
    if (order) {
      for (const item of items) {
        const retItem = returnRequest.items.find(ri => ri._id.toString() === item.itemId);
        if (retItem && retItem.orderItemId) {
          const orderItem = order.items.id(retItem.orderItemId);
          if (orderItem) {
            orderItem.refundStatus = 'refunded';
            orderItem.refundedAt = new Date();
          }
        }
      }
      await order.save();
    }

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
  getReturnDetails,
  resendPickupOtp
};