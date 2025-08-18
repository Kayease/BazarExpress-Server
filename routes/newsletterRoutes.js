const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletterController');
const { isAuth, isAdmin, hasPermission, canAccessSection } = require('../middleware/authMiddleware');

// Public routes
router.post('/subscribe', newsletterController.subscribe);
router.post('/unsubscribe', newsletterController.unsubscribe);

// Admin routes - Allow admin and marketing_content_manager
router.get('/', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('newsletter'), newsletterController.getAllSubscribers);
router.get('/active', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('newsletter'), newsletterController.getActiveSubscribers);
router.get('/stats', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('newsletter'), newsletterController.getNewsletterStats);
router.post('/send', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('newsletter'), newsletterController.sendNewsletter);
router.delete('/:id', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('newsletter'), newsletterController.deleteSubscriber);

module.exports = router; 