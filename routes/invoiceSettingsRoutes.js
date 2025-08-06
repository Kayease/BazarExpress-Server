const express = require('express');
const router = express.Router();
const {
    getInvoiceSettings,
    updateInvoiceSettings,
    getAllInvoiceSettings,
    deleteInvoiceSettings
} = require('../controllers/invoiceSettingsController');
const { isAuth, isAdmin } = require('../middleware/authMiddleware');

// Public route to get current invoice settings (for invoice generation)
router.get('/', getInvoiceSettings);

// Update invoice settings (admin only)
router.put('/', isAuth, isAdmin, updateInvoiceSettings);

// Get all invoice settings (admin only)
router.get('/all', isAuth, isAdmin, getAllInvoiceSettings);

// Delete invoice settings (admin only)
router.delete('/:id', isAuth, isAdmin, deleteInvoiceSettings);

module.exports = router;