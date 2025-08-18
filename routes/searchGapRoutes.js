const express = require('express');
const router = express.Router();
const {
  trackSearchGap,
  getSearchGaps,
  updateSearchGap,
  deleteSearchGap,
  getSearchGapStats
} = require('../controllers/searchGapController');
const { authenticateToken, hasPermission } = require('../middleware/authMiddleware');

// Public route to track search gaps
router.post('/track', trackSearchGap);

// Admin routes (require authentication and admin role)
router.get('/', authenticateToken, hasPermission(['admin', 'product_inventory_management']), getSearchGaps);
router.get('/stats', authenticateToken, hasPermission(['admin', 'product_inventory_management']), getSearchGapStats);
router.put('/:id', authenticateToken, hasPermission(['admin', 'product_inventory_management']), updateSearchGap);
router.delete('/:id', authenticateToken, hasPermission(['admin', 'product_inventory_management']), deleteSearchGap);

module.exports = router;