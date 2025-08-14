const express = require('express');
const { register, getAllUsers, deleteUser, updateUserRole, updateUserStatus, updateUserByAdmin, updateProfile, getProfile, getAllWarehouses, setUserPassword, resetPassword } = require('../controllers/authController');
const { isAuth, isAdmin, hasPermission, canAccessSection } = require('../middleware/authMiddleware');
const { sendOtp, verifyOtp, verifyPassword } = require('../controllers/authOtpController');

const router = express.Router();

router.post('/register', register);
router.post('/send-otp', sendOtp);
router.post('/verify-password', verifyPassword);
router.post('/verify-otp', verifyOtp);

// Temporary test login route for development
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const User = require('../models/User');
    const jwt = require('jsonwebtoken');
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // For testing, accept any password for existing users
    const token = jwt.sign(
      { id: user._id, phone: user.phone },
      process.env.JWT_SECRET || 'changeme',
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth,
        address: user.address || null,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.post('/reset-password', resetPassword);
router.put('/profile', isAuth, updateProfile);
router.get('/profile', isAuth, getProfile);
// Allow admin and customer support executive to view users
router.get('/users', isAuth, hasPermission(['admin', 'customer_support_executive']), canAccessSection('users'), getAllUsers);
// Admin route for users (used by frontend for delivery agents, etc.)
router.get('/admin/users', isAuth, hasPermission(['admin', 'customer_support_executive', 'order_warehouse_management']), canAccessSection('users'), getAllUsers);
// Only admin can delete users (customer support can't delete)
router.delete('/users/:id', isAuth, isAdmin, deleteUser);
router.delete('/admin/users/:id', isAuth, isAdmin, deleteUser);
// Only admin can change user roles (customer support can't change roles)
router.patch('/users/:id/role', isAuth, isAdmin, updateUserRole);
router.put('/admin/users/:id', isAuth, isAdmin, updateUserByAdmin);
// Allow admin and customer support executive to update user status (activate/deactivate)
router.patch('/users/:id/status', isAuth, hasPermission(['admin', 'customer_support_executive']), canAccessSection('users'), updateUserStatus);
// Only admin can fully edit user details (customer support can't edit user details)
router.put('/users/:id', isAuth, isAdmin, updateUserByAdmin);
// Only admin can set passwords for non-user roles
router.patch('/users/:id/password', isAuth, isAdmin, setUserPassword);
router.get('/warehouses', isAuth, isAdmin, getAllWarehouses);

module.exports = router;