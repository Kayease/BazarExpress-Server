const DeliverySettings = require('../models/DeliverySettings');
const Warehouse = require('../models/Warehouse');
const osrmService = require('../utils/osrmService');

// Get current delivery settings
const getDeliverySettings = async (req, res) => {
    try {
        const { warehouseType } = req.query;
        
        let query = { isActive: true };
        if (warehouseType && ['custom', 'global'].includes(warehouseType)) {
            query.warehouseType = warehouseType;
        }
        
        const settings = await DeliverySettings.findOne(query)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .sort({ updatedAt: -1 });
        
        if (!settings) {
            return res.status(404).json({ 
                success: false, 
                error: `Delivery settings not found${warehouseType ? ` for ${warehouseType} warehouses` : ''}` 
            });
        }
        
        res.json({ 
            success: true, 
            settings 
        });
    } catch (error) {
        console.error('Error fetching delivery settings:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch delivery settings' 
        });
    }
};

// Get all delivery settings (both custom and global)
const getAllDeliverySettings = async (req, res) => {
    try {
        const customSettings = await DeliverySettings.findOne({ 
            isActive: true, 
            warehouseType: 'custom' 
        })
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort({ updatedAt: -1 });
        
        const globalSettings = await DeliverySettings.findOne({ 
            isActive: true, 
            warehouseType: 'global' 
        })
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort({ updatedAt: -1 });
        
        res.json({ 
            success: true, 
            settings: {
                custom: customSettings,
                global: globalSettings
            }
        });
    } catch (error) {
        console.error('Error fetching all delivery settings:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch delivery settings' 
        });
    }
};

// Create or update delivery settings
const updateDeliverySettings = async (req, res) => {
    try {
        const {
            warehouseType = 'custom',
            freeDeliveryMinAmount,
            freeDeliveryRadius,
            baseDeliveryCharge,
            minimumDeliveryCharge,
            maximumDeliveryCharge,
            perKmCharge
        } = req.body;

        // Validate warehouse type
        if (!['custom', 'global'].includes(warehouseType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid warehouse type. Must be either "custom" or "global"'
            });
        }

        // Validation
        if (minimumDeliveryCharge > maximumDeliveryCharge) {
            return res.status(400).json({
                success: false,
                error: 'Minimum delivery charge cannot be greater than maximum delivery charge'
            });
        }

        if (baseDeliveryCharge < minimumDeliveryCharge) {
            return res.status(400).json({
                success: false,
                error: 'Base delivery charge cannot be less than minimum delivery charge'
            });
        }

        // Find existing active settings for this warehouse type
        let settings = await DeliverySettings.findOne({ 
            isActive: true, 
            warehouseType: warehouseType 
        });

        if (settings) {
            // Update existing settings
            settings.freeDeliveryMinAmount = freeDeliveryMinAmount;
            settings.freeDeliveryRadius = freeDeliveryRadius;
            settings.baseDeliveryCharge = baseDeliveryCharge;
            settings.minimumDeliveryCharge = minimumDeliveryCharge;
            settings.maximumDeliveryCharge = maximumDeliveryCharge;
            settings.perKmCharge = perKmCharge;
            settings.updatedBy = req.user.id;
            settings.updatedAt = new Date();

            await settings.save();
        } else {
            // Create new settings if none exist
            settings = new DeliverySettings({
                warehouseType,
                freeDeliveryMinAmount,
                freeDeliveryRadius,
                baseDeliveryCharge,
                minimumDeliveryCharge,
                maximumDeliveryCharge,
                perKmCharge,
                createdBy: req.user.id,
                updatedBy: req.user.id
            });

            await settings.save();
        }

        const populatedSettings = await DeliverySettings.findById(settings._id)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email');

        res.json({ 
            success: true, 
            message: 'Delivery settings updated successfully',
            settings: populatedSettings 
        });
    } catch (error) {
        console.error('Error updating delivery settings:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update delivery settings' 
        });
    }
};

// Calculate delivery charge for a specific order
const calculateDeliveryCharge = async (req, res) => {
    try {
        const { 
            customerLat, 
            customerLng, 
            warehouseId, 
            cartTotal, 
            paymentMethod = 'online',
            customerPincode,
            cartItems // Add cart items to determine which warehouses to validate
        } = req.body;

        console.log('\n========== DELIVERY CALCULATION START ==========');
        console.log('Request data:', {
            customerLat,
            customerLng,
            warehouseId,
            cartTotal,
            paymentMethod,
            customerPincode,
            cartItemsCount: cartItems ? cartItems.length : 0
        });

        if (!customerLat || !customerLng || !cartTotal) {
            return res.status(400).json({
                success: false,
                error: 'Customer location and cart total are required',
                errorType: 'MISSING_REQUIRED_FIELDS'
            });
        }

        // Find the best warehouse for delivery
        let selectedWarehouse, distance;
        
        if (warehouseId) {
            // Use specific warehouse if provided
            const warehouse = await Warehouse.findById(warehouseId);
            if (!warehouse || !warehouse.location) {
                return res.status(404).json({
                    success: false,
                    error: 'Warehouse not found or location not set',
                    errorType: 'WAREHOUSE_NOT_FOUND'
                });
            }
            
            // Validate pincode for custom warehouses (non-24x7)
            console.log('\n--- PINCODE VALIDATION ---');
            console.log('Warehouse:', warehouse.name);
            console.log('Is 24x7 delivery:', warehouse.deliverySettings.is24x7Delivery);
            console.log('Customer pincode:', customerPincode);
            console.log('Warehouse delivery pincodes:', warehouse.deliverySettings.deliveryPincodes);
            
            if (!warehouse.deliverySettings.is24x7Delivery && customerPincode) {
                const canDeliverToPincode = Array.isArray(warehouse.deliverySettings.deliveryPincodes) && 
                                          warehouse.deliverySettings.deliveryPincodes.includes(customerPincode);
                console.log('Can deliver to pincode:', canDeliverToPincode);
                
                if (!canDeliverToPincode) {
                    console.log('PINCODE VALIDATION FAILED - Returning error');
                    return res.status(400).json({
                        success: false,
                        error: `Delivery not available to pincode ${customerPincode}. Please check if this pincode is covered by our delivery network or try a different address.`,
                        errorType: 'PINCODE_NOT_SUPPORTED',
                        warehouse: {
                            id: warehouse._id,
                            name: warehouse.name,
                            address: warehouse.address,
                            type: 'custom'
                        },
                        customerPincode: customerPincode,
                        supportedPincodes: warehouse.deliverySettings.deliveryPincodes || []
                    });
                }
                console.log('PINCODE VALIDATION PASSED');
            } else if (!warehouse.deliverySettings.is24x7Delivery && !customerPincode) {
                console.log('WARNING: Custom warehouse but no pincode provided');
            } else {
                console.log('SKIPPING PINCODE VALIDATION (24x7 warehouse or no pincode)');
            }
            
            // Check if warehouse can deliver to this location using OSRM
            const distanceResult = await DeliverySettings.calculateDistance(
                warehouse.location.lat,
                warehouse.location.lng,
                customerLat,
                customerLng,
                'osrm'
            );
            distance = distanceResult.distance;
            
            if (distance > warehouse.deliverySettings.maxDeliveryRadius) {
                return res.status(400).json({
                    success: false,
                    error: `Delivery not available to this location from ${warehouse.name}. Maximum delivery radius is ${warehouse.deliverySettings.maxDeliveryRadius} km, but your location is ${distance.toFixed(2)} km away.`,
                    errorType: 'DELIVERY_RADIUS_EXCEEDED',
                    distance: Math.round(distance * 100) / 100,
                    maxRadius: warehouse.deliverySettings.maxDeliveryRadius,
                    warehouse: {
                        id: warehouse._id,
                        name: warehouse.name,
                        address: warehouse.address
                    }
                });
            }
            
            selectedWarehouse = warehouse;
        } else {
            // If no specific warehouse ID provided, find warehouses based on cart items
            if (cartItems && Array.isArray(cartItems) && cartItems.length > 0) {
                console.log('\n--- CART-BASED WAREHOUSE SELECTION ---');
                
                // Get unique warehouse IDs from cart items
                const cartWarehouseIds = [...new Set(cartItems.map(item => 
                    item.warehouseId || item.warehouse?._id || item.warehouse?.id
                ).filter(Boolean))];
                
                console.log('Cart warehouse IDs:', cartWarehouseIds);
                
                if (cartWarehouseIds.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Cart items must have valid warehouse information',
                        errorType: 'MISSING_WAREHOUSE_INFO'
                    });
                }
                
                // Get warehouses from cart
                const cartWarehouses = await Warehouse.find({
                    _id: { $in: cartWarehouseIds },
                    'location.lat': { $exists: true },
                    'location.lng': { $exists: true }
                });
                
                console.log('Found cart warehouses:', cartWarehouses.length);
                
                // Filter warehouses based on pincode validation
                const validWarehouses = [];
                for (const warehouse of cartWarehouses) {
                    console.log(`\nChecking warehouse: ${warehouse.name}`);
                    console.log('Is 24x7:', warehouse.deliverySettings.is24x7Delivery);
                    console.log('Warehouse pincodes:', warehouse.deliverySettings.deliveryPincodes);
                    
                    // For custom warehouses, validate pincode
                    if (!warehouse.deliverySettings.is24x7Delivery && customerPincode) {
                        const canDeliverToPincode = Array.isArray(warehouse.deliverySettings.deliveryPincodes) && 
                                                  warehouse.deliverySettings.deliveryPincodes.includes(customerPincode);
                        console.log(`Pincode ${customerPincode} validation for ${warehouse.name}:`, canDeliverToPincode);
                        console.log('Warehouse pincode list:', warehouse.deliverySettings.deliveryPincodes);
                        
                        if (canDeliverToPincode) {
                            console.log(`✓ ${warehouse.name} can deliver to pincode ${customerPincode}`);
                            validWarehouses.push(warehouse);
                        } else {
                            console.log(`✗ ${warehouse.name} cannot deliver to pincode ${customerPincode}`);
                        }
                    } else if (warehouse.deliverySettings.is24x7Delivery) {
                        // Global warehouses can deliver anywhere
                        console.log(`✓ ${warehouse.name} is a global warehouse (24x7) - can deliver anywhere`);
                        validWarehouses.push(warehouse);
                    } else {
                        // console.log(`⚠ ${warehouse.name} is custom warehouse but no pincode provided`);
                    }
                }
                
                // console.log('Valid warehouses after pincode check:', validWarehouses.length);
                
                if (validWarehouses.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: customerPincode ? 
                            `No warehouse from your cart can deliver to pincode ${customerPincode}. Please check if this pincode is covered by our delivery network or try a different address.` :
                            'No warehouse from your cart can deliver to this location',
                        errorType: 'NO_CART_WAREHOUSE_AVAILABLE'
                    });
                }
                
                // Find the nearest valid warehouse using OSRM
                const result = await osrmService.findNearestWarehouse(customerLat, customerLng, validWarehouses);
                if (!result) {
                    return res.status(400).json({
                        success: false,
                        error: 'Unable to calculate delivery distance to any warehouse from your cart',
                        errorType: 'DISTANCE_CALCULATION_FAILED'
                    });
                }
                
                selectedWarehouse = result.warehouse;
                distance = result.distance;
                
            } else {
                // Fallback to original logic for backward compatibility
                const result = await Warehouse.findBestWarehouseForDelivery(customerLat, customerLng, customerPincode);
                if (!result) {
                    return res.status(400).json({
                        success: false,
                        error: customerPincode ? 
                            `No warehouse available for delivery to pincode ${customerPincode}. Please check if this pincode is covered by our delivery network or try a different address.` :
                            'No warehouse available for delivery to this location',
                        errorType: 'NO_WAREHOUSE_AVAILABLE'
                    });
                }
                
                selectedWarehouse = result.warehouse;
                distance = result.distance;
            }
        }

        // Get delivery settings
        const settings = await DeliverySettings.findOne({ isActive: true });
        if (!settings) {
            return res.status(404).json({
                success: false,
                error: 'Delivery settings not configured',
                errorType: 'DELIVERY_SETTINGS_NOT_FOUND'
            });
        }

        // Calculate delivery charge using warehouse-specific settings
        const deliveryInfo = await DeliverySettings.calculateDeliveryChargeWithWarehouse(
            distance, 
            cartTotal, 
            paymentMethod,
            selectedWarehouse
        );

        // Get distance calculation result for response
        const finalDistanceResult = await DeliverySettings.calculateDistance(
            selectedWarehouse.location.lat,
            selectedWarehouse.location.lng,
            customerLat,
            customerLng,
            'osrm'
        );

        res.json({
            success: true,
            distance: Math.round(finalDistanceResult.distance * 100) / 100, // Round to 2 decimal places
            duration: Math.round(finalDistanceResult.duration * 100) / 100, // Duration in minutes
            calculationMethod: finalDistanceResult.method,
            warehouse: {
                id: selectedWarehouse._id,
                name: selectedWarehouse.name,
                address: selectedWarehouse.address
            },
            route: finalDistanceResult.route,
            ...deliveryInfo
        });
    } catch (error) {
        console.error('Error calculating delivery charge:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate delivery charge'
        });
    }
};

// Get delivery settings history
const getDeliverySettingsHistory = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const settings = await DeliverySettings.find()
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await DeliverySettings.countDocuments();

        res.json({
            success: true,
            settings,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching delivery settings history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch delivery settings history'
        });
    }
};

// Initialize default delivery settings
const initializeDeliverySettings = async (req, res) => {
    try {
        const existingSettings = await DeliverySettings.findOne({ isActive: true });
        
        if (existingSettings) {
            return res.json({
                success: true,
                message: 'Delivery settings already exist',
                settings: existingSettings
            });
        }

        const defaultSettings = new DeliverySettings({
            freeDeliveryMinAmount: 500,
            freeDeliveryRadius: 3,
            baseDeliveryCharge: 20,
            minimumDeliveryCharge: 10,
            maximumDeliveryCharge: 100,
            perKmCharge: 5,
            calculationMethod: 'osrm',
            createdBy: req.user.id,
            updatedBy: req.user.id
        });

        await defaultSettings.save();

        const populatedSettings = await DeliverySettings.findById(defaultSettings._id)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email');

        res.json({
            success: true,
            message: 'Default delivery settings initialized',
            settings: populatedSettings
        });
    } catch (error) {
        console.error('Error initializing delivery settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initialize delivery settings'
        });
    }
};

// Get OSRM server status
const getOSRMStatus = async (req, res) => {
    try {
        const status = await osrmService.checkHealth();
        
        res.json({
            success: true,
            osrm: {
                available: status.available,
                server: status.server,
                method: status.method || 'osrm',
                fallback: status.fallback || false,
                error: status.error || null
            }
        });
    } catch (error) {
        console.error('Error getting OSRM status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get OSRM status',
            osrm: {
                available: false,
                error: error.message
            }
        });
    }
};

// Calculate delivery charges for mixed warehouse orders
const calculateMixedWarehouseDelivery = async (req, res) => {
    try {
        const { 
            customerLat, 
            customerLng, 
            cartItemsByWarehouse, 
            paymentMethod = 'online',
            customerPincode
        } = req.body;

        console.log('\n========== MIXED WAREHOUSE DELIVERY CALCULATION START ==========');
        console.log('Request data:', {
            customerLat,
            customerLng,
            cartItemsByWarehouse: Object.keys(cartItemsByWarehouse || {}),
            paymentMethod,
            customerPincode
        });

        if (!customerLat || !customerLng || !cartItemsByWarehouse) {
            return res.status(400).json({
                success: false,
                error: 'Customer location and cart items by warehouse are required'
            });
        }

        // Validate cartItemsByWarehouse format
        if (typeof cartItemsByWarehouse !== 'object' || Object.keys(cartItemsByWarehouse).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Cart items by warehouse must be a non-empty object'
            });
        }

        const result = await DeliverySettings.calculateMixedWarehouseDelivery(
            customerLat,
            customerLng,
            cartItemsByWarehouse,
            paymentMethod,
            customerPincode
        );

        if (result.hasErrors) {
            console.warn('Some warehouses had calculation errors:', result);
        }

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error calculating mixed warehouse delivery:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate mixed warehouse delivery'
        });
    }
};

module.exports = {
    getDeliverySettings,
    getAllDeliverySettings,
    updateDeliverySettings,
    calculateDeliveryCharge,
    calculateMixedWarehouseDelivery,
    getDeliverySettingsHistory,
    initializeDeliverySettings,
    getOSRMStatus
};