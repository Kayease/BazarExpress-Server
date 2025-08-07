const express = require('express');
const router = express.Router();
const taxesController = require('../controllers/taxesController');
const { isAuth, hasPermission, canAccessSection } = require('../middleware/authMiddleware');

// Public routes (for product calculations)
router.get('/', taxesController.getAllTaxes);
router.get('/:id', taxesController.getTaxById);

// Admin routes with role-based access
router.post('/', 
    isAuth, 
    hasPermission(['admin', 'report_finance_analyst']),
    canAccessSection('taxes'),
    taxesController.createTax
);

router.put('/:id', 
    isAuth, 
    hasPermission(['admin', 'report_finance_analyst']),
    canAccessSection('taxes'),
    taxesController.updateTax
);

router.delete('/:id', 
    isAuth, 
    hasPermission(['admin', 'report_finance_analyst']),
    canAccessSection('taxes'),
    taxesController.deleteTax
);

module.exports = router;