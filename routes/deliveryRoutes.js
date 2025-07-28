const express = require('express');
const router = express.Router();
const {
    getDeliverySettings,
    updateDeliverySettings,
    calculateDeliveryCharge,
    getDeliverySettingsHistory,
    initializeDeliverySettings
} = require('../controllers/deliveryController');
const { isAuth, isAdmin } = require('../middleware/authMiddleware');

// Public routes
router.post('/calculate', calculateDeliveryCharge);
router.get('/settings', getDeliverySettings);

// Admin routes
router.post('/initialize', isAuth, isAdmin, initializeDeliverySettings);
router.put('/settings', isAuth, isAdmin, updateDeliverySettings);
router.get('/settings/history', isAuth, isAdmin, getDeliverySettingsHistory);

module.exports = router;