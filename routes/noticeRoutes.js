const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/noticeController');
const { isAuth, isAdmin } = require('../middleware/authMiddleware');

// Public: Get the currently active notice
router.get('/active', noticeController.getActiveNotice);

// Admin: Get all notices
router.get('/', isAuth, isAdmin, noticeController.getAllNotices);

// Admin: Create a new notice
router.post('/', isAuth, isAdmin, noticeController.createNotice);

// Admin: Update a notice
router.patch('/:id', isAuth, isAdmin, noticeController.updateNotice);

// Admin: Delete a notice
router.delete('/:id', isAuth, isAdmin, noticeController.deleteNotice);

// Admin: Manually trigger auto-activation
router.post('/auto-activate', isAuth, isAdmin, async (req, res) => {
  try {
    await noticeController.autoActivateNotices();
    res.json({ success: true, message: 'Auto-activation completed' });
  } catch (err) {
    res.status(500).json({ error: 'Auto-activation failed' });
  }
});

module.exports = router; 