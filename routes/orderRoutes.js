const express = require('express');
const router = express.Router();
const {
  createOrder,
  getUserOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  getOrdersByStatus
} = require('../controllers/orderController');
const { isAuth, isAdmin } = require('../middleware/authMiddleware');

// Public routes (with authentication)
router.post('/create', isAuth, createOrder);
router.get('/user/:userId', isAuth, getUserOrders);
router.get('/user', isAuth, getUserOrders); // Get current user's orders
router.get('/order/:orderId', isAuth, getOrderById);
router.put('/cancel/:orderId', isAuth, cancelOrder);

// Admin routes
router.get('/admin/all', isAuth, isAdmin, getAllOrders);
router.get('/admin/status/:status', isAuth, isAdmin, getOrdersByStatus);
router.put('/admin/status/:orderId', isAuth, isAdmin, updateOrderStatus);

module.exports = router;