const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { isAuth, hasPermission, hasWarehouseAccess, canAccessSection } = require('../middleware/authMiddleware');

// Public routes (no authentication required) - for website product display
router.get('/public', productController.getProducts);
router.get('/paginated', productController.getProductsPaginated);
router.get('/:id', productController.getProductById);

// Admin route with authentication and warehouse filtering
router.get('/', 
    isAuth, 
    hasPermission(['admin', 'product_inventory_management', 'marketing_content_manager']),
    hasWarehouseAccess,
    canAccessSection('products'),
    productController.getProducts
);

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