const { 
  createRazorpayOrder, 
  verifyPaymentSignature, 
  getPaymentDetails,
  refundPayment 
} = require('../services/razorpayService');
const Order = require('../models/Order');
const InvoiceCounter = require('../models/InvoiceCounter');
const User = require('../models/User');
const { updateProductStock, restoreProductStock } = require('../utils/stockManager');

/**
 * Create Razorpay order for payment
 */
const createPaymentOrder = async (req, res) => {
  try {
    const {
      amount,
      currency = 'INR',
      receipt,
      notes = {},
      orderData // Complete order data to be stored temporarily
    } = req.body;

    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User authentication required' 
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid amount is required' 
      });
    }

    // Create Razorpay order
    const razorpayOrderResult = await createRazorpayOrder({
      amount,
      currency,
      receipt: receipt || `order_${Date.now()}`,
      notes: {
        ...notes,
        userId,
        orderData: JSON.stringify(orderData) // Store order data in notes for later use
      }
    });

    if (!razorpayOrderResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment order',
        details: razorpayOrderResult.error
      });
    }

    // Return order details along with Razorpay key for frontend
    res.json({
      success: true,
      order: razorpayOrderResult.order,
      key: process.env.RAZORPAY_KEY_ID,
      amount: amount * 100, // Amount in paise for frontend
      currency,
      name: 'BazarXpress',
      description: 'Order Payment',
      prefill: {
        name: req.user.name,
        email: req.user.email,
        contact: req.user.phone
      }
    });

  } catch (error) {
    console.error('Error creating payment order:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Verify payment and create order
 */
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderData // Complete order data from frontend
    } = req.body;

    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User authentication required' 
      });
    }

    // Verify payment signature
    const isValidSignature = verifyPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature'
      });
    }

    // Get payment details from Razorpay
    const paymentDetailsResult = await getPaymentDetails(razorpay_payment_id);
    
    if (!paymentDetailsResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch payment details'
      });
    }

    const paymentDetails = paymentDetailsResult.payment;

    // Validate payment status
    if (paymentDetails.status !== 'captured') {
      return res.status(400).json({
        success: false,
        error: 'Payment not captured successfully'
      });
    }

    // Create order with payment information
    const orderId = Order.generateOrderId();
    
    // Generate invoice number using per-day atomic counter
    let invoiceNumber;
    try {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const dateKey = `${yyyy}${mm}${dd}`; // YYYYMMDD format for counter doc

      console.log(`[Payment] Generating invoice for dateKey: ${dateKey}`);

      const counterDoc = await InvoiceCounter.findOneAndUpdate(
        { dateKey },
        { $inc: { seq: 1 }, $setOnInsert: { dateKey } },
        { upsert: true, new: true }
      );
      
      console.log(`[Payment] Counter document:`, counterDoc);
      
      const seqStr = String(counterDoc.seq).padStart(2, '0');
      invoiceNumber = `INV-${dateKey}-${seqStr}`;
      
      console.log(`[Payment] Generated invoice number: ${invoiceNumber}`);
    } catch (invoiceError) {
      console.error('[Payment] Error generating invoice number:', invoiceError);
      // Don't fail the order creation, but log the error
      const fallbackDate = new Date();
      const fallbackYyyy = fallbackDate.getFullYear();
      const fallbackMm = String(fallbackDate.getMonth() + 1).padStart(2, '0');
      const fallbackDd = String(fallbackDate.getDate()).padStart(2, '0');
      const fallbackDateKey = `${fallbackYyyy}${fallbackMm}${fallbackDd}`;
      invoiceNumber = `INV-${fallbackDateKey}-${Date.now()}`;
      console.log(`[Payment] Fallback invoice number: ${invoiceNumber}`);
    }
    
    const order = new Order({
      orderId,
      userId,
      invoiceNumber,
      items: orderData.items,
      customerInfo: orderData.customerInfo,
      pricing: orderData.pricing,
      promoCode: orderData.promoCode,
      taxCalculation: orderData.taxCalculation,
      deliveryInfo: orderData.deliveryInfo,
      paymentInfo: {
        method: 'online',
        paymentMethod: paymentDetails.method, // upi, card, wallet, netbanking
        status: 'prepaid',
        transactionId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date(),
        paymentDetails: {
          amount: paymentDetails.amount / 100, // Convert from paise to rupees
          currency: paymentDetails.currency,
          method: paymentDetails.method,
          bank: paymentDetails.bank,
          wallet: paymentDetails.wallet,
          vpa: paymentDetails.vpa,
          card_id: paymentDetails.card_id
        }
      },
      warehouseInfo: orderData.warehouseInfo,
      notes: orderData.notes,
      status: 'new'
    });

    // Add initial status history
    order.addStatusHistory('new', userId, 'Order placed with online payment');

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
      await updateProductStock(orderData.items);
    } catch (stockErr) {
      console.error('Stock update error after online payment order creation:', stockErr);
      // Do not fail the order response on stock update issues, but log for investigation
    }

    res.json({
      success: true,
      message: 'Payment verified and order created successfully',
      order: populatedOrder,
      paymentId: razorpay_payment_id
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Handle payment failure
 */
const handlePaymentFailure = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      error
    } = req.body;

    console.log('Payment failed:', {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      error
    });

    // You can log this failure or take appropriate action
    // For now, just return a response
    res.json({
      success: false,
      message: 'Payment failed',
      error: error.description || 'Payment was not completed'
    });

  } catch (error) {
    console.error('Error handling payment failure:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Process refund for an order
 */
const processRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount, reason } = req.body;

    // Find the order
    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Check if order has online payment
    if (order.paymentInfo.method !== 'online' || !order.paymentInfo.transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Order does not have online payment to refund'
      });
    }

    // Process refund through Razorpay
    const refundResult = await refundPayment(
      order.paymentInfo.transactionId,
      amount, // If amount is provided, partial refund, otherwise full refund
      {
        reason: reason || 'Order cancellation',
        orderId: order.orderId
      }
    );

    if (!refundResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to process refund',
        details: refundResult.error
      });
    }

    // Update order with refund information
    order.paymentInfo.status = 'refunded';
    order.cancellation = {
      reason: reason || 'Order cancelled and refunded',
      cancelledAt: new Date(),
      cancelledBy: req.user.id,
      refundAmount: refundResult.refund.amount / 100, // Convert from paise
      refundStatus: 'processed',
      refundedAt: new Date(),
      refundId: refundResult.refund.id
    };

    // Update order status
    order.addStatusHistory('refunded', req.user.id, `Refund processed: ₹${refundResult.refund.amount / 100}`);

    // Restore product stock when order is refunded
    try {
      await restoreProductStock(order.items);
    } catch (stockErr) {
      console.error('Stock restore error after order refund:', stockErr);
      // Log error but don't fail the refund process
    }

    await order.save();

    res.json({
      success: true,
      message: 'Refund processed successfully',
      refund: refundResult.refund,
      order
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Get payment methods configuration
 */
const getPaymentMethods = async (req, res) => {
  try {
    const paymentMethods = {
      online: {
        enabled: true,
        methods: {
          upi: {
            enabled: true,
            name: 'UPI',
            description: 'Pay using Google Pay, PhonePe, Paytm & more',
            icon: 'upi'
          },
          card: {
            enabled: true,
            name: 'Credit/Debit Card',
            description: 'Visa, Mastercard, RuPay & more',
            icon: 'card'
          },
          netbanking: {
            enabled: true,
            name: 'Net Banking',
            description: 'All major banks supported',
            icon: 'bank'
          }
        }
      },
      cod: {
        enabled: true,
        name: 'Cash on Delivery',
        description: 'Pay when your order arrives',
        icon: 'cash',
        extraCharge: 0 // Can be configured
      }
    };

    res.json({
      success: true,
      paymentMethods,
      razorpayKey: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handlePaymentFailure,
  processRefund,
  getPaymentMethods
};