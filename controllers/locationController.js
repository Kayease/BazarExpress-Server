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
    console.log('\n========== DELIVERY VALIDATION START ==========');
    console.log('Time:', new Date().toISOString());
    
    try {
        console.log('\n--------------------');
        console.log('CART DELIVERY REQUEST');
        console.log('--------------------');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        
        // Handle both old format (cartItems, deliveryAddress) and new format (direct fields)
        let deliveryAddress, cartItems;
        
        if (req.body.deliveryAddress && req.body.cartItems) {
            // Old format from frontend
            deliveryAddress = req.body.deliveryAddress;
            cartItems = req.body.cartItems;
        } else {
            // New format with direct fields
            deliveryAddress = {
                lat: req.body.lat,
                lng: req.body.lng,
                pincode: req.body.pincode,
                address: req.body.address
            };
            cartItems = req.body.cartItems || [];
        }

        // If cart items are provided as string, parse them
        if (typeof cartItems === 'string') {
            try {
                cartItems = JSON.parse(cartItems);
            } catch (parseError) {
                console.error('Failed to parse cart items:', parseError);
                cartItems = [];
            }
        }

        console.log('Request Body:', {
            lat: deliveryAddress.lat,
            lng: deliveryAddress.lng,
            pincode: deliveryAddress.pincode,
            cartTotal: req.body.cartTotal,
            paymentMethod: req.body.paymentMethod
        });

        console.log('\nValidation Data:', {
            customerPincode: deliveryAddress.pincode,
            coordinates: `${deliveryAddress.lat}, ${deliveryAddress.lng}`,
            cartItemsCount: Array.isArray(cartItems) ? cartItems.length : 0
        });

        // For initial validation requests without cart items, we'll check basic delivery availability
        if (!Array.isArray(cartItems)) {
            cartItems = [];
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

        console.log('\n=== Delivery Validation ===');
        console.log('Customer Pincode:', deliveryAddress.pincode || 'Not provided');
        console.log('Number of items in cart:', cartItems.length);

        if (warehouseIds.length === 0) {
            console.error('Error: No valid warehouse IDs found in cart items');
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
        
        console.log('\nFound Warehouses:', warehouses.length);
        warehouses.forEach(w => {
            console.log(`\nWarehouse: ${w.name}`);
            console.log('- Delivery Type:', w.deliverySettings.is24x7Delivery ? '24x7' : 'Custom');
            console.log('- Allowed Pincodes:', w.deliverySettings.deliveryPincodes?.length || 0);
            if (!w.deliverySettings.is24x7Delivery) {
                console.log('- Pincode List:', w.deliverySettings.deliveryPincodes || []);
                console.log('- Matches Customer Pincode:', 
                    w.deliverySettings.deliveryPincodes?.includes(deliveryAddress.pincode) ? 'YES' : 'NO'
                );
            }
        });

        const validationResults = [];
        const undeliverableItems = [];

        console.log('Starting cart delivery validation for warehouses:', warehouseIds);
        
        // Check each warehouse's delivery capability
        for (const warehouse of warehouses) {
            console.log(`\n[Warehouse ${warehouse._id}] Validating delivery for ${warehouse.name}`);
            console.log(`[Warehouse ${warehouse._id}] Is 24x7 delivery:`, warehouse.deliverySettings.is24x7Delivery);
            
            try {
                // First check pincode for custom warehouses (non-24/7)
                if (!warehouse.deliverySettings.is24x7Delivery) {
                    const customerPincode = deliveryAddress.pincode;
                    console.log('\n------------------------');
                    console.log(`PINCODE CHECK: ${warehouse.name}`);
                    console.log('------------------------');
                    console.log('Customer Pincode:', customerPincode);
                    console.log('Warehouse Settings:', {
                        id: warehouse._id,
                        name: warehouse.name,
                        pincodes: warehouse.deliverySettings.deliveryPincodes || []
                    });
                    
                    if (!customerPincode) {
                        console.error(`[${warehouse.name}] Validation Failed: Missing customer pincode`);
                        const warehouseItems = cartItems.filter(item => item.warehouseId === warehouse._id.toString());
                        console.log('Items Affected:', {
                            warehouse: warehouse.name,
                            itemCount: warehouseItems.length,
                            itemIds: warehouseItems.map(item => item._id)
                        });
                        
                        undeliverableItems.push(...warehouseItems.map(item => ({
                            ...item,
                            warehouseName: warehouse.name,
                            reason: `Delivery address pincode is required for ${warehouse.name}`
                        })));
                        continue;
                    }

                    // Get the list of pincodes where this warehouse delivers
                    const allowedPincodes = warehouse.deliverySettings.deliveryPincodes || [];
                    console.log('→ Warehouse delivers to pincodes:', allowedPincodes.join(', ') || 'No pincodes configured');
                    console.log('→ Pincode match:', allowedPincodes.includes(customerPincode) ? 'YES' : 'NO');
                    
                    if (!allowedPincodes.includes(customerPincode)) {
                        console.error('\nPincode Match Failed:', {
                            warehouse: warehouse.name,
                            customerPincode: customerPincode,
                            allowedPincodeCount: allowedPincodes.length,
                            sampleAllowedPincodes: allowedPincodes.slice(0, 5),
                            message: 'Customer pincode not in allowed list'
                        });
                        const warehouseItems = cartItems.filter(item => item.warehouseId === warehouse._id.toString());
                        console.log('Failed Delivery Items:', {
                            count: warehouseItems.length,
                            items: warehouseItems.map(item => ({
                                id: item._id,
                                name: item.name,
                                quantity: item.quantity
                            }))
                        });
                        
                        undeliverableItems.push(...warehouseItems.map(item => ({
                            ...item,
                            warehouseName: warehouse.name,
                            reason: `${warehouse.name} does not deliver to pincode ${customerPincode}`
                        })));
                        continue;
                    }
                    
                    // console.log(`[Warehouse ${warehouse._id}] Pincode validation successful`);
                } else {
                    // console.log(`[Warehouse ${warehouse._id}] Skipping pincode validation for 24x7 warehouse`);
                }

                console.log(`[Warehouse ${warehouse._id}] Calculating delivery route...`);
                console.log(`[Warehouse ${warehouse._id}] From:`, warehouse.location);
                console.log(`[Warehouse ${warehouse._id}] To: lat=${customerLat}, lng=${customerLng}`);
                
                const result = await osrmService.calculateRoute(
                    warehouse.location.lat,
                    warehouse.location.lng,
                    customerLat,
                    customerLng
                );

                console.log(`[Warehouse ${warehouse._id}] Route calculation result:`, {
                    distance: result.distance,
                    duration: result.duration,
                    method: result.method
                });

                const canDeliver = result.distance <= warehouse.deliverySettings.maxDeliveryRadius;
                console.log(`[Warehouse ${warehouse._id}] Can deliver:`, canDeliver);
                console.log(`[Warehouse ${warehouse._id}] Distance:`, result.distance, 'km');
                console.log(`[Warehouse ${warehouse._id}] Max radius:`, warehouse.deliverySettings.maxDeliveryRadius, 'km');

                const warehouseItems = cartItems.filter(item => item.warehouseId === warehouse._id.toString());
                console.log(`[Warehouse ${warehouse._id}] Items from this warehouse:`, warehouseItems.length);

                validationResults.push({
                    warehouseId: warehouse._id,
                    warehouseName: warehouse.name,
                    distance: result.distance,
                    maxRadius: warehouse.deliverySettings.maxDeliveryRadius,
                    canDeliver,
                    itemCount: warehouseItems.length,
                    method: result.method
                });

                // For requests without cart items, we just need to check if delivery is possible
                if (cartItems.length === 0) {
                    if (!canDeliver) {
                        return res.status(400).json({
                            success: false,
                            error: `Delivery not available to pincode ${deliveryAddress.pincode}. Please check if this pincode is covered by our delivery network or try a different address.`
                        });
                    }
                    // If we find at least one warehouse that can deliver, we can return success
                    return res.json({
                        success: true,
                        deliveryAvailable: true,
                        warehouse: {
                            id: warehouse._id,
                            name: warehouse.name,
                            distance: result.distance,
                            duration: result.duration
                        }
                    });
                } else if (!canDeliver) {
                    undeliverableItems.push(...warehouseItems.map(item => ({
                        ...item,
                        warehouseName: warehouse.name,
                        reason: `Outside delivery radius (${result.distance.toFixed(2)}km > ${warehouse.deliverySettings.maxDeliveryRadius}km)`
                    })));
                }

            } catch (error) {
                console.error(`Error validating delivery for warehouse ${warehouse.name}:`, error.message);
                
                if (cartItems.length === 0) {
                    continue; // Try next warehouse for basic validation
                }
                
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