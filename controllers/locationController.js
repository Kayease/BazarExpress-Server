const Warehouse = require('../models/Warehouse');
const Product = require('../models/Product');
const osrmService = require('../utils/osrmService');

/**
 * Location-based delivery and product filtering controller
 */

/**
 * Check delivery availability for a location
 * Returns available warehouses and their delivery info
 */
const checkLocationDelivery = async (req, res) => {
    try {
        const { lat, lng } = req.body;

        // Validate coordinates
        if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) {
            return res.status(400).json({
                success: false,
                error: 'Valid latitude and longitude are required'
            });
        }

        const customerLat = Number(lat);
        const customerLng = Number(lng);

        // Get all active warehouses
        const warehouses = await Warehouse.find({ 
            status: 'active',
            'location.lat': { $exists: true },
            'location.lng': { $exists: true }
        });

        if (warehouses.length === 0) {
            return res.json({
                success: true,
                deliveryAvailable: false,
                message: 'No delivery available in your area',
                availableWarehouses: [],
                location: { lat: customerLat, lng: customerLng }
            });
        }

        console.log(`Checking delivery availability for location: ${customerLat}, ${customerLng}`);

        // Check delivery availability for each warehouse using OSRM
        const warehouseResults = [];
        
        for (const warehouse of warehouses) {
            try {
                const result = await osrmService.calculateRoute(
                    warehouse.location.lat,
                    warehouse.location.lng,
                    customerLat,
                    customerLng
                );

                const isWithinRadius = result.distance <= warehouse.deliverySettings.maxDeliveryRadius;
                const isFreeDeliveryZone = result.distance <= warehouse.deliverySettings.freeDeliveryRadius;

                if (isWithinRadius) {
                    warehouseResults.push({
                        warehouseId: warehouse._id,
                        warehouseName: warehouse.name,
                        warehouseAddress: warehouse.address,
                        distance: result.distance,
                        duration: result.duration,
                        method: result.method,
                        fallback: result.fallback,
                        deliverySettings: {
                            maxDeliveryRadius: warehouse.deliverySettings.maxDeliveryRadius,
                            freeDeliveryRadius: warehouse.deliverySettings.freeDeliveryRadius,
                            isDeliveryEnabled: warehouse.deliverySettings.isDeliveryEnabled
                        },
                        isFreeDeliveryZone,
                        canDeliver: warehouse.deliverySettings.isDeliveryEnabled
                    });
                }
            } catch (error) {
                console.error(`Error checking delivery for warehouse ${warehouse.name}:`, error.message);
                // Continue with other warehouses
            }
        }

        const deliveryAvailable = warehouseResults.length > 0;

        res.json({
            success: true,
            deliveryAvailable,
            message: deliveryAvailable 
                ? `Delivery available from ${warehouseResults.length} warehouse(s)`
                : 'No delivery available in your area. Please try a different location.',
            availableWarehouses: warehouseResults,
            location: { lat: customerLat, lng: customerLng },
            totalWarehouses: warehouses.length,
            deliverableWarehouses: warehouseResults.length
        });

    } catch (error) {
        console.error('Error checking location delivery:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check delivery availability',
            details: error.message
        });
    }
};

/**
 * Get products available for delivery to a specific location
 * Only returns products from warehouses that can deliver to the location
 */
const getProductsByLocation = async (req, res) => {
    try {
        const { lat, lng, category, search, page = 1, limit = 20 } = req.query;

        // Validate coordinates
        if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) {
            return res.status(400).json({
                success: false,
                error: 'Valid latitude and longitude are required'
            });
        }

        const customerLat = Number(lat);
        const customerLng = Number(lng);

        // First, check which warehouses can deliver to this location
        const deliveryCheck = await checkLocationDeliveryInternal(customerLat, customerLng);

        if (!deliveryCheck.deliveryAvailable) {
            return res.json({
                success: true,
                deliveryAvailable: false,
                message: 'No delivery available in your area',
                products: [],
                totalProducts: 0,
                location: { lat: customerLat, lng: customerLng },
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                }
            });
        }

        // Get warehouse IDs that can deliver
        const deliverableWarehouseIds = deliveryCheck.availableWarehouses.map(w => w.warehouseId);

        // Build product query
        let productQuery = {
            warehouseId: { $in: deliverableWarehouseIds },
            status: 'active',
            stock: { $gt: 0 }
        };

        // Add category filter if provided
        if (category) {
            productQuery.categoryId = category;
        }

        // Add search filter if provided
        if (search) {
            productQuery.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get products with pagination
        const [products, totalProducts] = await Promise.all([
            Product.find(productQuery)
                .populate('category', 'name')
                .populate('warehouseId', 'name address')
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ createdAt: -1 }),
            Product.countDocuments(productQuery)
        ]);

        // Add delivery info to each product
        const productsWithDelivery = products.map(product => {
            const warehouseDelivery = deliveryCheck.availableWarehouses.find(
                w => w.warehouseId.toString() === product.warehouseId._id.toString()
            );

            return {
                ...product.toObject(),
                deliveryInfo: warehouseDelivery ? {
                    distance: warehouseDelivery.distance,
                    duration: warehouseDelivery.duration,
                    isFreeDeliveryZone: warehouseDelivery.isFreeDeliveryZone,
                    warehouseName: warehouseDelivery.warehouseName
                } : null
            };
        });

        res.json({
            success: true,
            deliveryAvailable: true,
            message: `Found ${totalProducts} products available for delivery`,
            products: productsWithDelivery,
            totalProducts,
            location: { lat: customerLat, lng: customerLng },
            availableWarehouses: deliveryCheck.availableWarehouses,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalProducts,
                pages: Math.ceil(totalProducts / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error getting products by location:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get products for location',
            details: error.message
        });
    }
};

/**
 * Validate cart items against delivery address
 * Ensures all cart items can be delivered to the selected address
 */
const validateCartDelivery = async (req, res) => {
    try {
        const { cartItems, deliveryAddress } = req.body;

        // Validate input
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Cart items are required'
            });
        }

        if (!deliveryAddress || !deliveryAddress.lat || !deliveryAddress.lng) {
            return res.status(400).json({
                success: false,
                error: 'Valid delivery address with coordinates is required'
            });
        }

        const customerLat = Number(deliveryAddress.lat);
        const customerLng = Number(deliveryAddress.lng);

        // Get unique warehouse IDs from cart items
        const warehouseIds = [...new Set(cartItems.map(item => item.warehouseId).filter(Boolean))];

        if (warehouseIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Cart items must have valid warehouse information'
            });
        }

        // Get warehouses
        const warehouses = await Warehouse.find({
            _id: { $in: warehouseIds },
            status: 'active'
        });

        const validationResults = [];
        const undeliverableItems = [];

        // Check each warehouse's delivery capability
        for (const warehouse of warehouses) {
            try {
                const result = await osrmService.calculateRoute(
                    warehouse.location.lat,
                    warehouse.location.lng,
                    customerLat,
                    customerLng
                );

                const canDeliver = result.distance <= warehouse.deliverySettings.maxDeliveryRadius;
                const warehouseItems = cartItems.filter(item => item.warehouseId === warehouse._id.toString());

                validationResults.push({
                    warehouseId: warehouse._id,
                    warehouseName: warehouse.name,
                    distance: result.distance,
                    maxRadius: warehouse.deliverySettings.maxDeliveryRadius,
                    canDeliver,
                    itemCount: warehouseItems.length,
                    method: result.method
                });

                if (!canDeliver) {
                    undeliverableItems.push(...warehouseItems.map(item => ({
                        ...item,
                        warehouseName: warehouse.name,
                        reason: `Outside delivery radius (${result.distance.toFixed(2)}km > ${warehouse.deliverySettings.maxDeliveryRadius}km)`
                    })));
                }

            } catch (error) {
                console.error(`Error validating delivery for warehouse ${warehouse.name}:`, error.message);
                
                const warehouseItems = cartItems.filter(item => item.warehouseId === warehouse._id.toString());
                undeliverableItems.push(...warehouseItems.map(item => ({
                    ...item,
                    warehouseName: warehouse.name,
                    reason: 'Unable to calculate delivery distance'
                })));
            }
        }

        const allItemsDeliverable = undeliverableItems.length === 0;

        res.json({
            success: true,
            allItemsDeliverable,
            message: allItemsDeliverable 
                ? 'All cart items can be delivered to the selected address'
                : `${undeliverableItems.length} item(s) cannot be delivered to the selected address`,
            deliveryAddress: {
                lat: customerLat,
                lng: customerLng,
                address: deliveryAddress.address || 'Selected address'
            },
            validationResults,
            undeliverableItems,
            deliverableItemCount: cartItems.length - undeliverableItems.length,
            totalItemCount: cartItems.length
        });

    } catch (error) {
        console.error('Error validating cart delivery:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate cart delivery',
            details: error.message
        });
    }
};

/**
 * Internal helper function to check delivery availability
 * Used by other functions to avoid code duplication
 */
async function checkLocationDeliveryInternal(customerLat, customerLng) {
    const warehouses = await Warehouse.find({ 
        status: 'active',
        'location.lat': { $exists: true },
        'location.lng': { $exists: true }
    });

    if (warehouses.length === 0) {
        return {
            deliveryAvailable: false,
            availableWarehouses: []
        };
    }

    const warehouseResults = [];
    
    for (const warehouse of warehouses) {
        try {
            const result = await osrmService.calculateRoute(
                warehouse.location.lat,
                warehouse.location.lng,
                customerLat,
                customerLng
            );

            const isWithinRadius = result.distance <= warehouse.deliverySettings.maxDeliveryRadius;

            if (isWithinRadius && warehouse.deliverySettings.isDeliveryEnabled) {
                warehouseResults.push({
                    warehouseId: warehouse._id,
                    warehouseName: warehouse.name,
                    distance: result.distance,
                    duration: result.duration,
                    method: result.method,
                    fallback: result.fallback,
                    isFreeDeliveryZone: result.distance <= warehouse.deliverySettings.freeDeliveryRadius
                });
            }
        } catch (error) {
            console.error(`Error checking delivery for warehouse ${warehouse.name}:`, error.message);
        }
    }

    return {
        deliveryAvailable: warehouseResults.length > 0,
        availableWarehouses: warehouseResults
    };
}

module.exports = {
    checkLocationDelivery,
    getProductsByLocation,
    validateCartDelivery
};