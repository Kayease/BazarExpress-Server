const express = require('express');
const router = express.Router();
const {
  getReviews,
  getReview,
  createReview,
  updateReview,
  deleteReview,
  updateReviewStatus,
  markHelpful,
  getReviewStats,
  getProductReviews
} = require('../controllers/reviewController');
const { authenticateToken, optionalAuth } = require('../middleware/authMiddleware');

// Public routes (no authentication required)
router.get('/', optionalAuth, getReviews); // Get all reviews (only approved for public)
router.get('/product/:productId', getProductReviews); // Get reviews for specific product
router.get('/stats', getReviewStats); // Get review statistics

// Protected routes (authentication required)
router.use(authenticateToken); // All routes below require authentication

router.post('/', createReview); // Create new review
router.get('/:id', getReview); // Get single review
router.put('/:id', updateReview); // Update review
router.delete('/:id', deleteReview); // Delete review
router.post('/:id/helpful', markHelpful); // Mark review as helpful

// Admin routes (admin/customer support only)
router.put('/:id/status', updateReviewStatus); // Update review status (approve/reject/flag)

module.exports = router;