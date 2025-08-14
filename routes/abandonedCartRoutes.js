const express = require('express');
const router = express.Router();
const { isAuth, isAdmin, optionalAuth, canAccessSection } = require('../middleware/authMiddleware');
const {
    getAbandonedCarts,
    getAbandonedCartById,
    createAbandonedCart,
    sendReminder,
    markAsRecovered,
    deleteAbandonedCart,
    cleanupExpiredCarts
} = require('../controllers/abandonedCartController');
const AbandonedCartService = require('../services/abandonedCartService');

// Public routes for tracking (no authentication required)
router.post('/track', createAbandonedCart);

// New route for real-time unregistered user cart tracking
router.post('/track-guest', async (req, res) => {
    try {
        const { sessionId, cartItems, userInfo } = req.body;
        
        if (!sessionId || !cartItems || cartItems.length === 0) {
            return res.status(400).json({ error: 'Session ID and cart items are required' });
        }
        
        // Track the unregistered user cart in real-time
        const result = await AbandonedCartService.trackUnregisteredUserCart(sessionId, cartItems, userInfo);
        
        if (result) {
            res.json({ 
                message: 'Guest cart tracked successfully',
                cart: result 
            });
        } else {
            res.status(500).json({ error: 'Failed to track guest cart' });
        }
    } catch (error) {
        console.error('Track guest cart error:', error);
        res.status(500).json({ error: 'Failed to track guest cart' });
    }
});

router.patch('/recover', markAsRecovered);

// Admin routes - require authentication and proper permissions
const adminRoutes = express.Router();
adminRoutes.use(isAuth);
adminRoutes.use(canAccessSection('abandoned-cart'));

// Get all abandoned carts with filtering and pagination
adminRoutes.get('/', getAbandonedCarts);

// Get abandoned cart details by ID
adminRoutes.get('/:id', getAbandonedCartById);

// Send reminder for abandoned cart
adminRoutes.post('/:id/reminder', sendReminder);

// Mark abandoned cart as recovered (admin action)
adminRoutes.patch('/:id/recover', markAsRecovered);

// Delete abandoned cart
adminRoutes.delete('/:id', deleteAbandonedCart);

// Cleanup expired abandoned carts
adminRoutes.post('/cleanup/expired', cleanupExpiredCarts);

// New route for handling unregistered cart clearing
router.post('/clear-guest', async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        // Handle cart clearing for unregistered users
        const result = await AbandonedCartService.handleUnregisteredCartClear(sessionId);
        
        if (result) {
            res.json({ 
                message: 'Guest cart cleared successfully'
            });
        } else {
            res.status(500).json({ error: 'Failed to clear guest cart' });
        }
    } catch (error) {
        console.error('Clear guest cart error:', error);
        res.status(500).json({ error: 'Failed to clear guest cart' });
    }
});

// Clean up unregistered carts when user logs in
router.post('/cleanup-on-login', async (req, res) => {
    try {
        const { userId, sessionId } = req.body;
        
        if (!userId || !sessionId) {
            return res.status(400).json({ error: 'User ID and Session ID are required' });
        }
        
        // Clean up unregistered carts for this session
        const result = await AbandonedCartService.cleanupUnregisteredCartsOnLogin(userId, sessionId);
        
        if (result) {
            res.json({ 
                message: 'Unregistered carts cleaned up successfully'
            });
        } else {
            res.status(500).json({ error: 'Failed to clean up unregistered carts' });
        }
    } catch (error) {
        console.error('Cleanup on login error:', error);
        res.status(500).json({ error: 'Failed to clean up unregistered carts' });
    }
});

// Mount admin routes
router.use('/admin', adminRoutes);

module.exports = router;