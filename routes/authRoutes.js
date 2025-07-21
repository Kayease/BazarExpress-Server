const express = require('express');
const { register, login, getAllUsers, deleteUser, updateUserRole, updateUserStatus, updateUserByAdmin } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.put('/profile', authMiddleware, require('../controllers/authController').updateProfile);
router.get('/users', authMiddleware, getAllUsers);
router.delete('/users/:id', authMiddleware, deleteUser);
router.patch('/users/:id/role', authMiddleware, updateUserRole);
router.patch('/users/:id/status', authMiddleware, updateUserStatus);
router.put('/users/:id', authMiddleware, updateUserByAdmin);

module.exports = router;