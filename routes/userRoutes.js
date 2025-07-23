const express = require('express');
const { isAuth } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

const router = express.Router();

// Address management routes
router.get('/addresses', isAuth, userController.getAddresses);
router.post('/addresses', isAuth, userController.addAddress);
// Reset all default addresses - this specific route must be before the dynamic :addressId route
router.put('/addresses/reset-default', isAuth, userController.resetDefaultAddresses);
// Dynamic routes should come after specific routes
router.put('/addresses/:addressId', isAuth, userController.updateAddress);
router.delete('/addresses/:addressId', isAuth, userController.deleteAddress);

module.exports = router; 