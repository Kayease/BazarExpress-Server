const express = require('express');
const router = express.Router();
const promocodeController = require('../controllers/promocodeController');

router.get('/', promocodeController.getAllPromocodes);
router.get('/:id', promocodeController.getPromocode);
router.post('/', promocodeController.createPromocode);
router.put('/:id', promocodeController.updatePromocode);
router.delete('/:id', promocodeController.deletePromocode);

module.exports = router;