const express = require('express');
const { register, getAllUsers, deleteUser, updateUserRole, updateUserStatus, updateUserByAdmin, updateProfile, getProfile, getAllWarehouses } = require('../controllers/authController');
const { isAuth, isAdmin, hasPermission, canAccessSection } = require('../middleware/authMiddleware');
const { sendOtp, verifyOtp } = require('../controllers/authOtpController');

const router = express.Router();

router.post('/register', register);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.put('/profile', isAuth, updateProfile);
router.get('/profile', isAuth, getProfile);
// Allow admin and customer support executive to view users
router.get('/users', isAuth, hasPermission(['admin', 'customer_support_executive']), canAccessSection('users'), getAllUsers);
// Only admin can delete users (customer support can't delete)
router.delete('/users/:id', isAuth, isAdmin, deleteUser);
// Only admin can change user roles (customer support can't change roles)
router.patch('/users/:id/role', isAuth, isAdmin, updateUserRole);
// Allow admin and customer support executive to update user status (activate/deactivate)
router.patch('/users/:id/status', isAuth, hasPermission(['admin', 'customer_support_executive']), canAccessSection('users'), updateUserStatus);
// Only admin can fully edit user details (customer support can't edit user details)
router.put('/users/:id', isAuth, isAdmin, updateUserByAdmin);
router.get('/warehouses', isAuth, isAdmin, getAllWarehouses);

module.exports = router;