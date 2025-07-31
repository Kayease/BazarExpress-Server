const DeliverySettings = require('../models/DeliverySettings');
const Warehouse = require('../models/Warehouse');
const osrmService = require('../utils/osrmService');

// Get current delivery settings
const getDeliverySettings = async (req, res) => {
    try {
        const settings = await DeliverySettings.findOne({ isActive: true })
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .sort({ updatedAt: -1 });
        
        if (!settings) {
            return res.status(404).json({ 
                success: false, 
                error: 'Delivery settings not found' 
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

// Create or update delivery settings
const updateDeliverySettings = async (req, res) => {
    try {
        const {
            freeDeliveryMinAmount,
            freeDeliveryRadius,
            baseDeliveryCharge,
            minimumDeliveryCharge,
            maximumDeliveryCharge,
            perKmCharge,
            codExtraCharges
        } = req.body;

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

        // Find existing active settings
        let settings = await DeliverySettings.findOne({ isActive: true });

        if (settings) {
            // Update existing settings
            settings.freeDeliveryMinAmount = freeDeliveryMinAmount;
            settings.freeDeliveryRadius = freeDeliveryRadius;
            settings.baseDeliveryCharge = baseDeliveryCharge;
            settings.minimumDeliveryCharge = minimumDeliveryCharge;
            settings.maximumDeliveryCharge = maximumDeliveryCharge;
            settings.perKmCharge = perKmCharge;
            settings.codExtraCharges = codExtraCharges;
            settings.updatedBy = req.user.id;
            settings.updatedAt = new Date();

            await settings.save();
        } else {
            // Create new settings if none exist
            settings = new DeliverySettings({
                freeDeliveryMinAmount,
                freeDeliveryRadius,
                baseDeliveryCharge,
                minimumDeliveryCharge,
                maximumDeliveryCharge,
                perKmCharge,
                codExtraCharges,
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
            paymentMethod = 'online' 
        } = req.body;

        if (!customerLat || !customerLng || !cartTotal) {
            return res.status(400).json({
                success: false,
                error: 'Customer location and cart total are required'
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
                    error: 'Warehouse not found or location not set'
                });
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
            // Find the best warehouse automatically
            const result = await Warehouse.findBestWarehouseForDelivery(customerLat, customerLng);
            if (!result) {
                return res.status(400).json({
                    success: false,
                    error: 'No warehouse available for delivery to this location'
                });
            }
            
            selectedWarehouse = result.warehouse;
            distance = result.distance;
        }

        // Get delivery settings
        const settings = await DeliverySettings.findOne({ isActive: true });
        if (!settings) {
            return res.status(404).json({
                success: false,
                error: 'Delivery settings not configured'
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
            codAvailable: true,

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

module.exports = {
    getDeliverySettings,
    updateDeliverySettings,
    calculateDeliveryCharge,
    getDeliverySettingsHistory,
    initializeDeliverySettings,
    getOSRMStatus
};