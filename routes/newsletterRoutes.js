const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletterController');
const { isAuth, isAdmin } = require('../middleware/authMiddleware');

// Public routes
router.post('/subscribe', newsletterController.subscribe);
router.post('/unsubscribe', newsletterController.unsubscribe);

// Admin routes
router.get('/', isAuth, isAdmin, newsletterController.getAllSubscribers);
router.get('/active', isAuth, isAdmin, newsletterController.getActiveSubscribers);
router.get('/stats', isAuth, isAdmin, newsletterController.getNewsletterStats);
router.post('/send', isAuth, isAdmin, newsletterController.sendNewsletter);
router.delete('/:id', isAuth, isAdmin, newsletterController.deleteSubscriber);

module.exports = router; 