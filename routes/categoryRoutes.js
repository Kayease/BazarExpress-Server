const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { isAuth, hasPermission, canAccessSection } = require('../middleware/authMiddleware');

// Public routes
router.get('/', categoryController.getCategories);
router.get('/subcategories/:parentId', categoryController.getSubcategoriesByParent);
router.get('/paginated', categoryController.getCategoriesPaginated);

// Admin routes with role-based access
router.post('/', 
    isAuth, 
    hasPermission(['admin', 'product_inventory_management']),
    canAccessSection('categories'),
    categoryController.createCategory
);

router.put('/:id', 
    isAuth, 
    hasPermission(['admin', 'product_inventory_management']),
    canAccessSection('categories'),
    categoryController.updateCategory
);

router.delete('/:id', 
    isAuth, 
    hasPermission(['admin', 'product_inventory_management']),
    canAccessSection('categories'),
    categoryController.deleteCategory
);

module.exports = router;