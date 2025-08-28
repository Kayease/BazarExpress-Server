const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create a Razorpay order
 * @param {Object} orderData - Order details
 * @param {number} orderData.amount - Amount in paise (multiply by 100)
 * @param {string} orderData.currency - Currency code (default: INR)
 * @param {string} orderData.receipt - Receipt ID
 * @param {Object} orderData.notes - Additional notes
 * @returns {Promise<Object>} Razorpay order object
 */
const createRazorpayOrder = async (orderData) => {
  try {
    const options = {
      amount: orderData.amount * 100, // Amount in paise
      currency: orderData.currency || 'INR',
      receipt: orderData.receipt,
      notes: orderData.notes || {},
    };

    const order = await razorpay.orders.create(options);
    return {
      success: true,
      order,
    };
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Verify Razorpay payment signature
 * @param {Object} paymentData - Payment verification data
 * @param {string} paymentData.razorpay_order_id - Razorpay order ID
 * @param {string} paymentData.razorpay_payment_id - Razorpay payment ID
 * @param {string} paymentData.razorpay_signature - Razorpay signature
 * @returns {boolean} Verification result
 */
const verifyPaymentSignature = (paymentData) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;
    
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === razorpay_signature;
  } catch (error) {
    console.error('Error verifying payment signature:', error);
    return false;
  }
};

/**
 * Get payment details by payment ID
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<Object>} Payment details
 */
const getPaymentDetails = async (paymentId) => {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return {
      success: true,
      payment,
    };
  } catch (error) {
    console.error('Error fetching payment details:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Refund a payment
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Refund amount in paise (optional, full refund if not provided)
 * @param {Object} notes - Additional notes for refund
 * @returns {Promise<Object>} Refund details
 */
const refundPayment = async (paymentId, amount = null, notes = {}) => {
  try {
    const refundData = {
      notes,
    };
    
    if (amount) {
      refundData.amount = amount * 100; // Convert to paise
    }

    const refund = await razorpay.payments.refund(paymentId, refundData);
    return {
      success: true,
      refund,
    };
  } catch (error) {
    console.error('Error processing refund:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get order details by order ID
 * @param {string} orderId - Razorpay order ID
 * @returns {Promise<Object>} Order details
 */
const getRazorpayOrderDetails = async (orderId) => {
  try {
    const order = await razorpay.orders.fetch(orderId);
    return {
      success: true,
      order,
    };
  } catch (error) {
    console.error('Error fetching order details:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  createRazorpayOrder,
  verifyPaymentSignature,
  getPaymentDetails,
  refundPayment,
  getRazorpayOrderDetails,
  razorpay,
};