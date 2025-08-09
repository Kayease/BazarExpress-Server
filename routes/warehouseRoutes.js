const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/warehouseController');
const { isAuth, hasPermission, hasWarehouseAccess, canAccessSection } = require('../middleware/authMiddleware');

// Admin routes with role-based access
router.post('/', 
    isAuth, 
    hasPermission(['admin']), // Only admin can create warehouses
    warehouseController.createWarehouse
);

router.get('/', 
    isAuth, 
    hasPermission(['admin', 'order_warehouse_management', 'product_inventory_management']),
    hasWarehouseAccess,
    canAccessSection('warehouse'),
    warehouseController.getWarehouses
);

router.put('/:id', 
    isAuth, 
    hasPermission(['admin', 'order_warehouse_management']),
    hasWarehouseAccess,
    canAccessSection('warehouse'),
    warehouseController.updateWarehouse
);

router.get('/:id/check-products', 
    isAuth, 
    hasPermission(['admin', 'order_warehouse_management']),
    hasWarehouseAccess,
    canAccessSection('warehouse'),
    warehouseController.checkWarehouseProducts
);

// Only admin can delete warehouses
router.delete('/:id', 
    isAuth, 
    hasPermission(['admin']),
    warehouseController.deleteWarehouse
);

// Public routes for delivery system
router.post('/check-pincode', warehouseController.checkPincodeDelivery);
router.get('/products-by-pincode', warehouseController.getProductsByPincode);
router.post('/delivery-status', warehouseController.getDeliveryStatus);

module.exports = router;