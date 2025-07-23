const express = require('express');
const { isAuth } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

const router = express.Router();

// Address management routes
router.get('/addresses', isAuth, userController.getAddresses);
router.post('/addresses', isAuth, userController.addAddress);
router.put('/addresses/:addressId', isAuth, userController.updateAddress);
router.delete('/addresses/:addressId', isAuth, userController.deleteAddress);
router.put('/addresses/:addressId/default', isAuth, userController.setDefaultAddress);

module.exports = router; 