const express = require('express');
const router = express.Router();
const { isAuth, hasPermission, hasWarehouseAccess, canAccessSection } = require('../middleware/authMiddleware');
const reportsController = require('../controllers/reportsController');

// All endpoints require auth, role permission, warehouse access context, and reports section access
router.use(
  isAuth,
  hasPermission(['admin', 'report_finance_analyst']),
  hasWarehouseAccess,
  canAccessSection('reports')
);

// Summary cards and charts
router.get('/summary', reportsController.getSummary);

// Orders listing (paginated)
router.get('/orders', reportsController.getOrders);

// Exports
router.get('/export/csv', reportsController.exportCsv);
router.get('/export/tally', reportsController.exportTallyXml);

module.exports = router;


