const mongoose = require('mongoose');
const osrmService = require('../utils/osrmService');

const deliverySettingsSchema = new mongoose.Schema({
    // Free delivery criteria
    freeDeliveryMinAmount: { 
        type: Number, 
        required: true, 
        default: 500,
        min: 0
    },
    freeDeliveryRadius: { 
        type: Number, 
        required: true, 
        default: 3,
        min: 0
    },
    
    // Delivery charge settings
    baseDeliveryCharge: { 
        type: Number, 
        required: true, 
        default: 20,
        min: 0
    },
    minimumDeliveryCharge: { 
        type: Number, 
        required: true, 
        default: 10,
        min: 0
    },
    maximumDeliveryCharge: { 
        type: Number, 
        required: true, 
        default: 100,
        min: 0
    },
    perKmCharge: { 
        type: Number, 
        required: true, 
        default: 5,
        min: 0
    },
    
    // COD settings
    codExtraCharges: { 
        type: Boolean, 
        default: false 
    },

    
    // Distance calculation method
    calculationMethod: {
        type: String,
        enum: ['osrm', 'haversine', 'straight_line'],
        default: 'osrm'
    },
    
    // Active status
    isActive: { 
        type: Boolean, 
        default: true 
    },
    
    // Metadata
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    updatedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

// Static methods for delivery calculations
deliverySettingsSchema.statics.calculateDeliveryCharge = async function(distance, cartTotal, paymentMethod = 'online') {
    const settings = await this.findOne({ isActive: true }).sort({ updatedAt: -1 });
    
    if (!settings) {
        throw new Error('Delivery settings not found');
    }
    
    let deliveryCharge = 0;
    let isFreeDelivery = false;
    let freeDeliveryEligible = false;
    
    // Check if eligible for free delivery
    if (cartTotal >= settings.freeDeliveryMinAmount && distance <= settings.freeDeliveryRadius) {
        isFreeDelivery = true;
        deliveryCharge = 0;
    } else {
        // Calculate delivery charge based on distance
        if (distance <= settings.freeDeliveryRadius) {
            deliveryCharge = settings.baseDeliveryCharge;
        } else {
            const extraDistance = distance - settings.freeDeliveryRadius;
            deliveryCharge = settings.baseDeliveryCharge + (extraDistance * settings.perKmCharge);
        }
        
        // Apply min/max limits
        deliveryCharge = Math.max(settings.minimumDeliveryCharge, deliveryCharge);
        deliveryCharge = Math.min(settings.maximumDeliveryCharge, deliveryCharge);
    }
    
    // No COD extra charges - only delivery charge applies
    
    // Check if user can get free delivery by adding more items
    const amountNeededForFreeDelivery = Math.max(0, settings.freeDeliveryMinAmount - cartTotal);
    if (amountNeededForFreeDelivery > 0 && distance <= settings.freeDeliveryRadius) {
        freeDeliveryEligible = true;
    }
    
    return {
        deliveryCharge,
        totalDeliveryCharge: deliveryCharge,
        isFreeDelivery,
        freeDeliveryEligible,
        amountNeededForFreeDelivery,
        settings: {
            freeDeliveryMinAmount: settings.freeDeliveryMinAmount,
            freeDeliveryRadius: settings.freeDeliveryRadius,
            baseDeliveryCharge: settings.baseDeliveryCharge,
            perKmCharge: settings.perKmCharge,
            codAvailable: settings.codAvailable
        }
    };
};

// Calculate delivery charge with warehouse-specific settings
deliverySettingsSchema.statics.calculateDeliveryChargeWithWarehouse = async function(distance, cartTotal, paymentMethod = 'online', warehouse) {
    const settings = await this.findOne({ isActive: true }).sort({ updatedAt: -1 });
    
    if (!settings) {
        throw new Error('Delivery settings not found');
    }
    
    let deliveryCharge = 0;
    let isFreeDelivery = false;
    let freeDeliveryEligible = false;
    
    // Use warehouse-specific free delivery radius if available, otherwise use global settings
    const freeDeliveryRadius = warehouse.deliverySettings?.freeDeliveryRadius || settings.freeDeliveryRadius;
    
    // Check if eligible for free delivery
    if (cartTotal >= settings.freeDeliveryMinAmount && distance <= freeDeliveryRadius) {
        isFreeDelivery = true;
        deliveryCharge = 0;
    } else {
        // Calculate delivery charge based on distance
        if (distance <= freeDeliveryRadius) {
            deliveryCharge = settings.baseDeliveryCharge;
        } else {
            const extraDistance = distance - freeDeliveryRadius;
            deliveryCharge = settings.baseDeliveryCharge + (extraDistance * settings.perKmCharge);
        }
        
        // Apply min/max limits
        deliveryCharge = Math.max(settings.minimumDeliveryCharge, deliveryCharge);
        deliveryCharge = Math.min(settings.maximumDeliveryCharge, deliveryCharge);
    }
    
    // No COD extra charges - only delivery charge applies
    
    // Check if user can get free delivery by adding more items
    const amountNeededForFreeDelivery = Math.max(0, settings.freeDeliveryMinAmount - cartTotal);
    if (amountNeededForFreeDelivery > 0 && distance <= freeDeliveryRadius) {
        freeDeliveryEligible = true;
    }
    
    return {
        deliveryCharge,
        totalDeliveryCharge: deliveryCharge,
        isFreeDelivery,
        freeDeliveryEligible,
        amountNeededForFreeDelivery,
        warehouseSettings: {
            freeDeliveryRadius: freeDeliveryRadius,
            maxDeliveryRadius: warehouse.deliverySettings?.maxDeliveryRadius || 50,
            isDeliveryEnabled: warehouse.deliverySettings?.isDeliveryEnabled !== false
        },
        settings: {
            freeDeliveryMinAmount: settings.freeDeliveryMinAmount,
            freeDeliveryRadius: settings.freeDeliveryRadius,
            baseDeliveryCharge: settings.baseDeliveryCharge,
            perKmCharge: settings.perKmCharge,
            codAvailable: settings.codAvailable
        }
    };
};

// Distance calculation with OSRM integration
deliverySettingsSchema.statics.calculateDistance = async function(lat1, lon1, lat2, lon2, method = 'osrm') {
    if (method === 'osrm') {
        try {
            const result = await osrmService.calculateRoute(lat1, lon1, lat2, lon2);
            return {
                distance: result.distance,
                duration: result.duration,
                method: result.route.fallback ? 'haversine_fallback' : 'osrm',
                route: result.route
            };
        } catch (error) {
            console.warn('OSRM calculation failed, falling back to Haversine:', error.message);
            // Fallback to Haversine
            method = 'haversine';
        }
    }
    
    if (method === 'straight_line') {
        // Simple straight line distance (less accurate but faster)
        const R = 6371; // Earth's radius in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const distance = Math.sqrt(dLat * dLat + dLon * dLon) * R;
        return {
            distance: distance,
            duration: osrmService.estimateDurationFromDistance(distance),
            method: 'straight_line',
            route: null
        };
    } else {
        // Haversine formula (more accurate than straight line)
        const R = 6371; // Earth's radius in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        return {
            distance: distance,
            duration: osrmService.estimateDurationFromDistance(distance),
            method: 'haversine',
            route: null
        };
    }
};

// Instance methods
deliverySettingsSchema.methods.updateSettings = function(updates) {
    Object.assign(this, updates);
    this.updatedAt = new Date();
    return this.save();
};

// Pre-save middleware
deliverySettingsSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Validation
deliverySettingsSchema.pre('save', function(next) {
    if (this.minimumDeliveryCharge > this.maximumDeliveryCharge) {
        next(new Error('Minimum delivery charge cannot be greater than maximum delivery charge'));
    }
    if (this.baseDeliveryCharge < this.minimumDeliveryCharge) {
        next(new Error('Base delivery charge cannot be less than minimum delivery charge'));
    }
    next();
});

module.exports = mongoose.model('DeliverySettings', deliverySettingsSchema);