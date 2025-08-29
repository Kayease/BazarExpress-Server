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
    hasPermission(['admin', 'order_warehouse_management', 'product_inventory_management', 'delivery_boy', 'customer_support_executive']),
    hasWarehouseAccess,
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

// Admin route for checking pincode availability
router.get('/check-pincode-availability', 
    isAuth, 
    hasPermission(['admin', 'order_warehouse_management']),
    warehouseController.checkPincodeAvailability
);

// Public routes for delivery system
router.post('/check-pincode', warehouseController.checkPincodeDelivery);
router.get('/products-by-pincode', warehouseController.getProductsByPincode);
router.post('/delivery-status', warehouseController.getDeliveryStatus);

module.exports = router;