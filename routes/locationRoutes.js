const express = require('express');
const router = express.Router();
const {
    checkLocationDelivery,
    getProductsByLocation,
    validateCartDelivery
} = require('../controllers/locationController');

// Public routes for location-based services

/**
 * POST /api/location/check-delivery
 * Check if delivery is available to a specific location
 * Body: { lat: number, lng: number }
 */
router.post('/check-delivery', checkLocationDelivery);

/**
 * GET /api/location/products
 * Get products available for delivery to a specific location
 * Query: lat, lng, category?, search?, page?, limit?
 */
router.get('/products', getProductsByLocation);

/**
 * POST /api/location/validate-cart
 * Validate if all cart items can be delivered to the selected address
 * Body: { cartItems: Array, deliveryAddress: { lat, lng, address } }
 */
router.post('/validate-cart', validateCartDelivery);

module.exports = router;