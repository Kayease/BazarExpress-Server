const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/warehouseController');

router.post('/', warehouseController.createWarehouse);
router.get('/', warehouseController.getWarehouses);
router.put('/:id', warehouseController.updateWarehouse);
router.delete('/:id', warehouseController.deleteWarehouse);

module.exports = router;