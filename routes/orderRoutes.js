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
const { isAuth, isAdmin, hasPermission, hasWarehouseAccess, canAccessSection } = require('../middleware/authMiddleware');

// Public routes (with authentication)
router.post('/create', isAuth, createOrder);
router.get('/user/:userId', isAuth, getUserOrders);
router.get('/user', isAuth, getUserOrders); // Get current user's orders
router.get('/order/:orderId', isAuth, getOrderById);
router.put('/cancel/:orderId', isAuth, cancelOrder);

// Admin routes with role-based access
router.get('/admin/all', 
    isAuth, 
    hasPermission(['admin', 'customer_support_executive', 'order_warehouse_management']),
    hasWarehouseAccess,
    canAccessSection('orders'),
    getAllOrders
);

router.get('/admin/status/:status', 
    isAuth, 
    hasPermission(['admin', 'customer_support_executive', 'order_warehouse_management']),
    hasWarehouseAccess,
    canAccessSection('orders'),
    getOrdersByStatus
);

// Only admin and order_warehouse_management can update order status
router.put('/admin/status/:orderId', 
    isAuth, 
    hasPermission(['admin', 'order_warehouse_management']),
    hasWarehouseAccess,
    canAccessSection('orders'),
    updateOrderStatus
);

module.exports = router;