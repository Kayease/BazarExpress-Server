const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');

// Public routes (no authentication required)
router.get('/published', blogController.getPublishedBlogs);
router.get('/categories', blogController.getBlogCategories);
router.get('/slug/:slug', blogController.getBlogBySlug);
router.post('/like/:slug', blogController.toggleLike);

// Admin routes (should be protected with authentication middleware)
router.get('/', blogController.getAllBlogs);
router.get('/stats', blogController.getBlogStats);
router.get('/:id', blogController.getBlogById);
router.post('/', blogController.createBlog);
router.put('/:id', blogController.updateBlog);
router.delete('/:id', blogController.deleteBlog);

module.exports = router; 