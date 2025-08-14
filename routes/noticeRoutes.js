const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/noticeController');
const { isAuth, isAdmin, hasPermission, canAccessSection } = require('../middleware/authMiddleware');

// Public: Get the currently active notice
router.get('/active', noticeController.getActiveNotice);

// Admin routes - Allow admin and marketing_content_manager
router.get('/', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('notices'), noticeController.getAllNotices);

// Admin: Get notice statistics
router.get('/stats', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('notices'), noticeController.getNoticeStats);

// Admin: Create a new notice
router.post('/', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('notices'), noticeController.createNotice);

// Admin: Update a notice
router.patch('/:id', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('notices'), noticeController.updateNotice);

// Admin: Delete a notice
router.delete('/:id', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('notices'), noticeController.deleteNotice);

// Admin: Manually trigger auto-activation
router.post('/auto-activate', isAuth, hasPermission(['admin', 'marketing_content_manager']), canAccessSection('notices'), async (req, res) => {
  try {
    await noticeController.autoActivateNotices();
    res.json({ success: true, message: 'Auto-activation completed' });
  } catch (err) {
    res.status(500).json({ error: 'Auto-activation failed' });
  }
});

module.exports = router; 