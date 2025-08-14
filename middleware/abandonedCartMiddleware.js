const AbandonedCartService = require('../services/abandonedCartService');

// Middleware to track cart activity
const trackCartActivity = async (req, res, next) => {
    try {
        // Only track cart activity for authenticated users
        if (req.user && req.user._id) {
            // Track cart activity when users interact with their cart
            await AbandonedCartService.trackCartActivity(req.user._id, 'update');
        }
        next();
    } catch (error) {
        console.error('Error tracking cart activity:', error);
        next(); // Continue even if tracking fails
    }
};

// Middleware to check for abandoned carts periodically
const checkAbandonedCarts = async (req, res, next) => {
    try {
        // Only check occasionally to avoid performance issues
        // You can adjust this logic based on your needs
        const shouldCheck = Math.random() < 0.1; // 10% chance to check
        
        if (shouldCheck) {
            // Run this asynchronously to not block the request
            setImmediate(async () => {
                try {
                    await AbandonedCartService.checkForAbandonedCarts();
                } catch (error) {
                    console.error('Error checking abandoned carts:', error);
                }
            });
        }
        
        next();
    } catch (error) {
        console.error('Error in abandoned cart check middleware:', error);
        next(); // Continue even if check fails
    }
};

// Middleware to clean up expired carts (run less frequently)
const cleanupExpiredCarts = async (req, res, next) => {
    try {
        // Only cleanup occasionally (1% chance)
        const shouldCleanup = Math.random() < 0.01;
        
        if (shouldCleanup) {
            setImmediate(async () => {
                try {
                    await AbandonedCartService.cleanupExpiredCarts();
                } catch (error) {
                    console.error('Error cleaning up expired carts:', error);
                }
            });
        }
        
        next();
    } catch (error) {
        console.error('Error in expired cart cleanup middleware:', error);
        next();
    }
};

module.exports = {
    trackCartActivity,
    checkAbandonedCarts,
    cleanupExpiredCarts
};
