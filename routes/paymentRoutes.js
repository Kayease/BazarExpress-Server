const express = require('express');
const router = express.Router();
const {
  createPaymentOrder,
  verifyPayment,
  handlePaymentFailure,
  processRefund,
  getPaymentMethods
} = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Get payment methods configuration
router.get('/methods', getPaymentMethods);

// Create Razorpay order for payment (requires authentication)
router.post('/create-order', authenticateToken, createPaymentOrder);

// Verify payment and create order (requires authentication)
router.post('/verify', authenticateToken, verifyPayment);

// Handle payment failure (requires authentication)
router.post('/failure', authenticateToken, handlePaymentFailure);

// Process refund for an order (admin only)
router.post('/refund/:orderId', authenticateToken, processRefund);

module.exports = router;