const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const { isAuth, isAdmin, hasPermission, canAccessSection } = require('../middleware/authMiddleware');

// Public routes (no authentication required)
router.get('/published', blogController.getPublishedBlogs);
router.get('/categories', blogController.getBlogCategories);
router.get('/slug/:slug', blogController.getBlogBySlug);
router.post('/like/:slug', blogController.toggleLike);

// Admin routes - Allow admin and marketing_content_manager
router.get('/', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('blog'), blogController.getAllBlogs);
router.get('/stats', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('blog'), blogController.getBlogStats);
router.get('/:id', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('blog'), blogController.getBlogById);
router.post('/', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('blog'), blogController.createBlog);
router.put('/:id', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('blog'), blogController.updateBlog);
router.delete('/:id', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('blog'), blogController.deleteBlog);

module.exports = router; 