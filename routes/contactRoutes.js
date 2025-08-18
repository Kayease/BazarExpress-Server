const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

// Public routes (no authentication required)
router.post('/submit', contactController.submitContact);

// Admin routes (should be protected with authentication middleware)
router.get('/', contactController.getAllContacts);
router.get('/stats', contactController.getContactStats);
router.get('/:id', contactController.getContactById);
router.put('/:id/status', contactController.updateContactStatus);
router.delete('/:id', contactController.deleteContact);

module.exports = router; 