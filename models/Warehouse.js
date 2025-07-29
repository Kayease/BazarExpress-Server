const mongoose = require('mongoose');
const osrmService = require('../utils/osrmService');

const warehouseSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    location: {
        lat: { type: Number },
        lng: { type: Number },
    },
    contactPhone: { type: String },
    email: { type: String },
    capacity: { type: Number },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    
    // Delivery settings for this warehouse
    deliverySettings: {
        maxDeliveryRadius: { 
            type: Number, 
            default: 50, // Maximum delivery radius in km
            min: 0 
        },
        freeDeliveryRadius: { 
            type: Number, 
            default: 3, // Free delivery radius in km
            min: 0 
        },
        isDeliveryEnabled: { 
            type: Boolean, 
            default: true 
        },
        deliveryDays: [{
            type: String,
            enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        }],
        deliveryHours: {
            start: { type: String, default: '09:00' }, // 24-hour format
            end: { type: String, default: '21:00' }
        }
    },
    
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

warehouseSchema.statics.createWarehouse = function(input) {
    if (!input || typeof input !== 'object') {
        throw new Error('Invalid input: warehouse data is required');
    }
    const { name, address, location, contactPhone, email, capacity, status, userId } = input;
    if (!name || !address || !userId) {
        throw new Error('Missing required fields: name, address, userId');
    }
    return this.create({ name, address, location, contactPhone, email, capacity, status, userId });
};

warehouseSchema.statics.getWarehousesByUser = function(userId) {
    return this.find({ userId });
};

warehouseSchema.statics.getWarehouseById = function(id) {
    return this.findById(id);
};

warehouseSchema.statics.updateWarehouse = function(id, updates) {
    updates.updatedAt = new Date();
    return this.findByIdAndUpdate(id, updates, { new: true });
};

warehouseSchema.statics.deleteWarehouse = function(id) {
    return this.findByIdAndDelete(id);
};

// Find the best warehouse for delivery to a specific location using OSRM
warehouseSchema.statics.findBestWarehouseForDelivery = async function(customerLat, customerLng) {
    const warehouses = await this.find({ 
        status: 'active',
        'deliverySettings.isDeliveryEnabled': true,
        'location.lat': { $exists: true },
        'location.lng': { $exists: true }
    });
    
    if (warehouses.length === 0) {
        return null;
    }
    
    try {
        // Use OSRM to find the nearest warehouse with accurate road distances
        const result = await osrmService.findNearestWarehouse(customerLat, customerLng, warehouses);
        
        if (result && result.warehouse) {
            // Check if the nearest warehouse can deliver to this location
            const canDeliver = result.distance <= result.warehouse.deliverySettings.maxDeliveryRadius;
            
            if (canDeliver) {
                return {
                    warehouse: result.warehouse,
                    distance: result.distance,
                    duration: result.duration,
                    method: result.fallback ? 'haversine_fallback' : 'osrm'
                };
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error finding best warehouse with OSRM:', error.message);
        
        // Fallback to Haversine calculation
        console.warn('Falling back to Haversine calculation for warehouse selection');
        
        const availableWarehouses = [];
        
        for (const warehouse of warehouses) {
            const distance = calculateDistance(
                warehouse.location.lat,
                warehouse.location.lng,
                customerLat,
                customerLng
            );
            
            if (distance <= warehouse.deliverySettings.maxDeliveryRadius) {
                availableWarehouses.push({
                    warehouse,
                    distance,
                    duration: osrmService.estimateDurationFromDistance(distance),
                    method: 'haversine_fallback'
                });
            }
        }
        
        if (availableWarehouses.length === 0) {
            return null;
        }
        
        // Return the closest warehouse
        availableWarehouses.sort((a, b) => a.distance - b.distance);
        return availableWarehouses[0];
    }
};

// Helper function for distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

module.exports = mongoose.model('Warehouse', warehouseSchema);