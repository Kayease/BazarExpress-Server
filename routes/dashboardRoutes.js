const express = require('express');
const router = express.Router();
const { isAuth, hasPermission } = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

// Simple in-memory cache with short TTL per authenticated user/role/warehouse set
const dashboardCache = new Map();
const TTL_MS = 30 * 1000; // 30 seconds
const cacheKey = (req) => {
  try {
    const userId = req.user?._id || req.user?.id || 'anon';
    const role = req.user?.role || 'unknown';
    const warehouses = (req.assignedWarehouseIds || []).slice().sort();
    return JSON.stringify({ userId, role, warehouses });
  } catch (_) {
    return 'fallback';
  }
};

function cacheMiddleware(req, res, next) {
  try {
    const key = cacheKey(req);
    const cached = dashboardCache.get(key);
    if (cached && Date.now() - cached.ts < TTL_MS) {
      return res.json(cached.data);
    }
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      try {
        dashboardCache.set(key, { ts: Date.now(), data: body });
      } catch (_) {}
      return originalJson(body);
    };
    next();
  } catch (err) {
    next();
  }
}

// Unified dashboard endpoint for all admin roles
// Each role gets role-specific data from controller
router.get('/', 
  isAuth,
  hasPermission(['admin', 'product_inventory_management', 'order_warehouse_management', 'marketing_content_manager', 'customer_support_executive', 'report_finance_analyst', 'delivery_boy']),
  cacheMiddleware,
  dashboardController.getDashboard
);

module.exports = router;