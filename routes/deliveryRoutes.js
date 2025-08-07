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
const { isAuth, isAdmin, hasPermission, canAccessSection } = require('../middleware/authMiddleware');

// Public routes
router.post('/calculate', calculateDeliveryCharge);
router.post('/calculate-mixed', calculateMixedWarehouseDelivery);
router.get('/settings', getDeliverySettings);
router.get('/settings/all', getAllDeliverySettings);
router.get('/osrm/status', getOSRMStatus);

// Admin routes (admin and report_finance_analyst)
router.post('/initialize', 
    isAuth, 
    hasPermission(['admin', 'report_finance_analyst']), 
    canAccessSection('delivery'),
    initializeDeliverySettings
);

router.put('/settings', 
    isAuth, 
    hasPermission(['admin', 'report_finance_analyst']), 
    canAccessSection('delivery'),
    updateDeliverySettings
);

router.get('/settings/history', 
    isAuth, 
    hasPermission(['admin', 'report_finance_analyst']), 
    canAccessSection('delivery'),
    getDeliverySettingsHistory
);

module.exports = router;