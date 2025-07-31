const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/warehouseController');

router.post('/', warehouseController.createWarehouse);
router.get('/', warehouseController.getWarehouses);
router.put('/:id', warehouseController.updateWarehouse);
router.get('/:id/check-products', warehouseController.checkWarehouseProducts);
router.delete('/:id', warehouseController.deleteWarehouse);

// New routes for dynamic delivery system
router.post('/check-pincode', warehouseController.checkPincodeDelivery);
router.get('/products-by-pincode', warehouseController.getProductsByPincode);
router.post('/delivery-status', warehouseController.getDeliveryStatus);

module.exports = router;