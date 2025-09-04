const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/returnController');
const { authenticateToken, hasPermission, hasWarehouseAccess } = require('../middleware/authMiddleware');

// Customer routes
router.post('/create', authenticateToken, createReturnRequest);
router.get('/user', authenticateToken, getUserReturns);
router.get('/:returnId', authenticateToken, getReturnDetails);
router.post('/:returnId/verify-otp', authenticateToken, verifyPickupOtp);
// Resend pickup OTP by re-triggering pickup_assigned with existing agent
router.post('/:returnId/resend-otp', authenticateToken, hasPermission(['admin', 'order_warehouse_management', 'delivery_boy']), resendPickupOtp);

// Admin/Warehouse Manager routes
router.get('/admin/all', authenticateToken, hasPermission(['admin', 'order_warehouse_management']), hasWarehouseAccess, getAllReturnRequests);
router.put('/:returnId/status', authenticateToken, hasPermission(['admin', 'order_warehouse_management']), hasWarehouseAccess, updateReturnStatus);
router.post('/:returnId/refund', authenticateToken, hasPermission(['admin', 'order_warehouse_management']), hasWarehouseAccess, processRefund);

// Delivery agent routes
router.get('/delivery/assigned', authenticateToken, hasPermission(['delivery_boy']), getDeliveryAgentReturns);
router.put('/:returnId/pickup', authenticateToken, hasPermission(['delivery_boy']), updatePickupStatus);

module.exports = router;