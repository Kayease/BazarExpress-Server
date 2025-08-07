const express = require('express');
const router = express.Router();
const promocodeController = require('../controllers/promocodeController');
const { isAuth, hasPermission, canAccessSection } = require('../middleware/authMiddleware');

// Public routes
router.get('/available', promocodeController.getAvailablePromocodes);
router.post('/validate', promocodeController.validatePromocode);
router.post('/apply', promocodeController.applyPromocode);

// Admin routes with role-based access
router.get('/', 
    isAuth, 
    hasPermission(['admin', 'marketing_content_manager']),
    canAccessSection('promocodes'),
    promocodeController.getAllPromocodes
);

router.get('/:id', 
    isAuth, 
    hasPermission(['admin', 'marketing_content_manager']),
    canAccessSection('promocodes'),
    promocodeController.getPromocode
);

router.post('/', 
    isAuth, 
    hasPermission(['admin', 'marketing_content_manager']),
    canAccessSection('promocodes'),
    promocodeController.createPromocode
);

router.put('/:id', 
    isAuth, 
    hasPermission(['admin', 'marketing_content_manager']),
    canAccessSection('promocodes'),
    promocodeController.updatePromocode
);

router.delete('/:id', 
    isAuth, 
    hasPermission(['admin', 'marketing_content_manager']),
    canAccessSection('promocodes'),
    promocodeController.deletePromocode
);

module.exports = router;