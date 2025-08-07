const express = require('express');
const router = express.Router();
const {
    getInvoiceSettings,
    updateInvoiceSettings,
    getAllInvoiceSettings,
    deleteInvoiceSettings
} = require('../controllers/invoiceSettingsController');
const { isAuth, isAdmin, hasPermission, canAccessSection } = require('../middleware/authMiddleware');

// Public route to get current invoice settings (for invoice generation)
router.get('/', getInvoiceSettings);

// Update invoice settings (admin and report_finance_analyst)
router.put('/', 
    isAuth, 
    hasPermission(['admin', 'report_finance_analyst']), 
    canAccessSection('invoice-settings'),
    updateInvoiceSettings
);

// Get all invoice settings (admin and report_finance_analyst)
router.get('/all', 
    isAuth, 
    hasPermission(['admin', 'report_finance_analyst']), 
    canAccessSection('invoice-settings'),
    getAllInvoiceSettings
);

// Delete invoice settings (admin only - keep restricted)
router.delete('/:id', isAuth, isAdmin, deleteInvoiceSettings);

module.exports = router;