const express = require('express');
const router = express.Router();
const {
    getDeliverySettings,
    getAllDeliverySettings,
    updateDeliverySettings,
    calculateDeliveryCharge,
    calculateMixedWarehouseDelivery,
    getDeliverySettingsHistory,
    initializeDeliverySettings,
    getOSRMStatus
} = require('../controllers/deliveryController');
const { isAuth, isAdmin } = require('../middleware/authMiddleware');

// Public routes
router.post('/calculate', calculateDeliveryCharge);
router.post('/calculate-mixed', calculateMixedWarehouseDelivery);
router.get('/settings', getDeliverySettings);
router.get('/settings/all', getAllDeliverySettings);
router.get('/osrm/status', getOSRMStatus);

// Admin routes
router.post('/initialize', isAuth, isAdmin, initializeDeliverySettings);
router.put('/settings', isAuth, isAdmin, updateDeliverySettings);
router.get('/settings/history', isAuth, isAdmin, getDeliverySettingsHistory);

module.exports = router;