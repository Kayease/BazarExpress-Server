const express = require('express');
const router = express.Router();
const taxesController = require('../controllers/taxesController');

// GET all taxes
router.get('/', taxesController.getAllTaxes);
// GET a single tax by ID
router.get('/:id', taxesController.getTaxById);
// POST create a new tax
router.post('/', taxesController.createTax);
// PUT update a tax by ID
router.put('/:id', taxesController.updateTax);
// DELETE a tax by ID
router.delete('/:id', taxesController.deleteTax);

module.exports = router;