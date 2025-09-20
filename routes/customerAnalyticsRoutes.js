const express = require('express');
const router = express.Router();
const {
  getCustomerAnalytics,
  getCustomers,
  getCustomerDetails,
  getCustomerSegments
} = require('../controllers/customerAnalyticsController');
const { isAuth, hasPermission, canAccessSection } = require('../middleware/authMiddleware');

// Customer Analytics routes - Admin and Customer Support Executive only
router.get('/analytics', 
  isAuth, 
  hasPermission(['admin', 'customer_support_executive']),
  canAccessSection('customer_analytics'),
  getCustomerAnalytics
);

router.get('/customers', 
  isAuth, 
  hasPermission(['admin', 'customer_support_executive']),
  canAccessSection('customer_analytics'),
  getCustomers
);

router.get('/customers/:customerId', 
  isAuth, 
  hasPermission(['admin', 'customer_support_executive']),
  canAccessSection('customer_analytics'),
  getCustomerDetails
);

router.get('/segments', 
  isAuth, 
  hasPermission(['admin', 'customer_support_executive']),
  canAccessSection('customer_analytics'),
  getCustomerSegments
);

module.exports = router;
