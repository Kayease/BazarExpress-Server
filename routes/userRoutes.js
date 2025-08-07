const express = require('express');
const { isAuth, hasPermission, canAccessSection } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

const router = express.Router();

// Address management routes (for regular users)
router.get('/addresses', isAuth, userController.getAddresses);
router.post('/addresses', isAuth, userController.addAddress);
// Reset all default addresses - this specific route must be before the dynamic :addressId route
router.put('/addresses/reset-default', isAuth, userController.resetDefaultAddresses);
// Dynamic routes should come after specific routes
router.put('/addresses/:addressId', isAuth, userController.updateAddress);
router.delete('/addresses/:addressId', isAuth, userController.deleteAddress);

// Admin routes for user management
router.get('/admin/all', 
    isAuth, 
    hasPermission(['admin', 'customer_support_executive']),
    canAccessSection('users'),
    userController.getAllUsers
);

router.put('/admin/:userId/status', 
    isAuth, 
    hasPermission(['admin', 'customer_support_executive']),
    canAccessSection('users'),
    userController.updateUserStatus
);

module.exports = router; 