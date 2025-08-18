const express = require('express');
const router = express.Router();
const { isAuth } = require('../middleware/authMiddleware');
const { trackCartActivity } = require('../middleware/abandonedCartMiddleware');
const {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    syncCart
} = require('../controllers/cartController');

// All cart routes require authentication
router.use(isAuth);

// Track cart activity for abandoned cart detection
router.use(trackCartActivity);

// Get user's cart
router.get('/', getCart);

// Add item to cart
router.post('/add', addToCart);

// Update cart item quantity
router.put('/update', updateCartItem);

// Remove item from cart
router.delete('/remove/:productId', removeFromCart);

// Clear entire cart
router.delete('/clear', clearCart);

// Sync local cart with database cart
router.post('/sync', syncCart);

module.exports = router;