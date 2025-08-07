const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { isAuth, hasPermission, hasWarehouseAccess, canAccessSection } = require('../middleware/authMiddleware');

// Public routes (no authentication required)
router.get('/', productController.getProducts);
router.get('/paginated', productController.getProductsPaginated);
router.get('/:id', productController.getProductById);

// Admin routes with role-based access
router.post('/', 
    isAuth, 
    hasPermission(['admin', 'product_inventory_management']),
    hasWarehouseAccess,
    canAccessSection('products'),
    productController.createProduct
);

router.put('/:id', 
    isAuth, 
    hasPermission(['admin', 'product_inventory_management']),
    hasWarehouseAccess,
    canAccessSection('products'),
    productController.updateProduct
);

router.delete('/:id', 
    isAuth, 
    hasPermission(['admin', 'product_inventory_management']),
    hasWarehouseAccess,
    canAccessSection('products'),
    productController.deleteProduct
);

router.post('/delete-image', 
    isAuth, 
    hasPermission(['admin', 'product_inventory_management']),
    canAccessSection('products'),
    productController.deleteImageByPublicId
);

module.exports = router;