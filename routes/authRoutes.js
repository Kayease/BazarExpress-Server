const express = require('express');
const { register, getAllUsers, deleteUser, updateUserRole, updateUserStatus, updateUserByAdmin } = require('../controllers/authController');
const { isAuth, isAdmin } = require('../middleware/authMiddleware');
const { sendOtp, verifyOtp } = require('../controllers/authOtpController');

const router = express.Router();

router.post('/register', register);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.put('/profile', isAuth, require('../controllers/authController').updateProfile);
router.get('/profile', isAuth, require('../controllers/authController').getProfile);
router.get('/users', isAuth, isAdmin, getAllUsers);
router.delete('/users/:id', isAuth, isAdmin, deleteUser);
router.patch('/users/:id/role', isAuth, isAdmin, updateUserRole);
router.patch('/users/:id/status', isAuth, isAdmin, updateUserStatus);
router.put('/users/:id', isAuth, isAdmin, updateUserByAdmin);

module.exports = router;