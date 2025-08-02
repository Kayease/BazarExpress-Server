const express = require('express');
const router = express.Router();
const { isAuth } = require('../middleware/authMiddleware');
const {
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    clearWishlist,
    syncWishlist,
    isInWishlist
} = require('../controllers/wishlistController');

// All wishlist routes require authentication
router.use(isAuth);

// Get user's wishlist
router.get('/', getWishlist);

// Add item to wishlist
router.post('/add', addToWishlist);

// Remove item from wishlist
router.delete('/remove/:productId', removeFromWishlist);

// Clear entire wishlist
router.delete('/clear', clearWishlist);

// Sync local wishlist with database wishlist
router.post('/sync', syncWishlist);

// Check if item is in wishlist
router.get('/check/:productId', isInWishlist);

module.exports = router;