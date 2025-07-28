const express = require('express');
const router = express.Router();
const promocodeController = require('../controllers/promocodeController');

router.get('/', promocodeController.getAllPromocodes);
router.get('/available', promocodeController.getAvailablePromocodes);
router.get('/:id', promocodeController.getPromocode);
router.post('/', promocodeController.createPromocode);
router.put('/:id', promocodeController.updatePromocode);
router.delete('/:id', promocodeController.deletePromocode);

// Promocode validation and application routes
router.post('/validate', promocodeController.validatePromocode);
router.post('/apply', promocodeController.applyPromocode);

module.exports = router;