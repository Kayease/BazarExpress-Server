const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/noticeController');
const authMiddleware = require('../middleware/authMiddleware');

// Public: Get the currently active notice
router.get('/active', noticeController.getActiveNotice);

// Admin: Get all notices
router.get('/', authMiddleware, noticeController.getAllNotices);

// Admin: Create a new notice
router.post('/', authMiddleware, noticeController.createNotice);

// Admin: Update a notice
router.patch('/:id', authMiddleware, noticeController.updateNotice);

// Admin: Delete a notice
router.delete('/:id', authMiddleware, noticeController.deleteNotice);

// Admin: Manually trigger auto-activation
router.post('/auto-activate', authMiddleware, async (req, res) => {
  try {
    await noticeController.autoActivateNotices();
    res.json({ success: true, message: 'Auto-activation completed' });
  } catch (err) {
    res.status(500).json({ error: 'Auto-activation failed' });
  }
});

module.exports = router; 