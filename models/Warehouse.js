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
    
    // Delivery settings for this warehouse
    deliverySettings: {
        isDeliveryEnabled: { 
            type: Boolean, 
            default: true 
        },
        disabledMessage: {
            type: String,
            default: 'Delivery is currently unavailable in your area. Please try again later or switch to Global Store.'
        },
        deliveryPincodes: [{
            type: String,
            validate: {
                validator: function(v) {
                    return /^\d{6}$/.test(v);
                },
                message: props => `${props.value} is not a valid 6-digit pincode!`
            }
        }],
        is24x7Delivery: {
            type: Boolean,
            default: true
        },
        deliveryDays: [{
            type: String,
            enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        }],
        deliveryHours: {
            start: { type: String, default: '09:00' }, // 24-hour format
            end: { type: String, default: '21:00' }
        },
        timezone: {
            type: String,
            default: 'Asia/Kolkata'
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

// Find warehouses by PIN code for the new delivery system
warehouseSchema.statics.findWarehousesByPincode = async function(pincode) {
    if (!pincode || !/^\d{6}$/.test(pincode)) {
        throw new Error('Valid 6-digit pincode is required');
    }
    
    // Find custom warehouses that deliver to this pincode (non-24x7 with specific pincodes)
    const customWarehouses = await this.find({
        'deliverySettings.is24x7Delivery': false,
        'deliverySettings.deliveryPincodes': pincode,
        'location.lat': { $exists: true },
        'location.lng': { $exists: true }
    });
    
    // Find 24x7 warehouses (global stores) - they can deliver to any pincode
    const globalWarehouses = await this.find({
        'deliverySettings.is24x7Delivery': true,
        'deliverySettings.isDeliveryEnabled': true,
        'location.lat': { $exists: true },
        'location.lng': { $exists: true }
    });
    
    return {
        customWarehouses,
        globalWarehouses
    };
};

// Fetch eligible products for a pincode with pagination, category, and search
warehouseSchema.statics.getEligibleProductsByPincode = async function(pincode, options = {}) {
    // console.log('[Warehouse.getEligibleProductsByPincode] Called with:', { pincode, options });
    try {
    const Product = require('./Product');
    const { page = 1, limit = 20, category, search } = options;
    // 1. Get eligible warehouses (custom + global)
    const { customWarehouses, globalWarehouses } = await this.findWarehousesByPincode(pincode);
        // console.log('[Warehouse.getEligibleProductsByPincode] customWarehouses:', customWarehouses.length, 'globalWarehouses:', globalWarehouses.length);
        let warehousesToUse = [];
        let deliveryMode = 'none';
        let deliveryMessage = '';
        if (customWarehouses.length > 0) {
            warehousesToUse = customWarehouses;
            deliveryMode = 'custom';
            deliveryMessage = 'Delivery available from local warehouse';
        } else if (globalWarehouses.length > 0) {
            warehousesToUse = globalWarehouses;
            deliveryMode = 'global';
            // Check if any 24x7 warehouse explicitly lists this pincode for same-day delivery
            let sameDayWarehouse = globalWarehouses.find(w => Array.isArray(w.deliverySettings.deliveryPincodes) && w.deliverySettings.deliveryPincodes.includes(pincode));
            if (sameDayWarehouse) {
                deliveryMessage = 'Same day delivery';
                // console.log('[Warehouse.getEligibleProductsByPincode] 24x7 warehouse with same-day delivery found:', sameDayWarehouse._id);
            } else {
                deliveryMessage = 'May take few days';
            }
        } else {
            // console.warn('[Warehouse.getEligibleProductsByPincode] No warehouses found for pincode:', pincode);
            return {
                products: [],
                totalProducts: 0,
                warehouses: [],
                deliveryMode: 'none',
                deliveryMessage: 'No delivery available for this pincode',
                pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 }
            };
        }
        const warehouseIds = warehousesToUse.map(w => w._id);
        // console.log('[Warehouse.getEligibleProductsByPincode] warehouseIds:', warehouseIds);
        // 2. Build product query
        let productQuery = {
            warehouse: { $in: warehouseIds },
            status: 'active',
            stock: { $gt: 0 }
        };
        if (category) {
            productQuery.category = category;
            // console.log('[Warehouse.getEligibleProductsByPincode] Filtering by category:', category);
        }
        if (search) {
            productQuery.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
            // console.log('[Warehouse.getEligibleProductsByPincode] Filtering by search:', search);
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        // console.log('[Warehouse.getEligibleProductsByPincode] Product query:', productQuery, '| Skip:', skip, '| Limit:', limit);
        // 3. Fetch products and total count
        const [products, totalProducts] = await Promise.all([
            Product.find(productQuery)
                .populate('category')
                .populate('subcategory')
                .populate('brand')
                .populate('warehouse')
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ createdAt: -1 }),
            Product.countDocuments(productQuery)
        ]);
        // console.log('[Warehouse.getEligibleProductsByPincode] Products found:', products.length, 'Total:', totalProducts);
        // 4. Return results
        return {
            products,
            totalProducts,
            warehouses: warehousesToUse,
            deliveryMode,
            deliveryMessage,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalProducts,
                pages: Math.ceil(totalProducts / parseInt(limit))
            }
        };
    } catch (err) {
        console.error('[Warehouse.getEligibleProductsByPincode] ERROR:', err);
        throw err;
    }
};

// Format time (e.g., '09:00' -> '9:00 AM')
function formatTime12Hour(time24) {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    let hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    if (hour === 0) hour = 12;
    else if (hour > 12) hour -= 12;
    return `${hour}:${minutes} ${ampm}`;
}

// Check if a warehouse is currently delivering
warehouseSchema.statics.isWarehouseCurrentlyDelivering = function(warehouse, timezone = 'Asia/Kolkata') {
    if (!warehouse.deliverySettings.isDeliveryEnabled) {
        return {
            isDelivering: false,
            message: warehouse.deliverySettings.disabledMessage || 'Delivery is currently disabled for this store',
            shortMessage: 'Store Disabled',
            reason: 'disabled',
        };
    }
    if (warehouse.deliverySettings.is24x7Delivery) {
        return {
            isDelivering: true,
            message: 'Same day delivery available',
            shortMessage: 'Same day delivery available',
            reason: 'open_24x7',
        };
    }
    // Time logic
    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
    const deliveryDays = warehouse.deliverySettings.deliveryDays || [];
    const deliveryHours = warehouse.deliverySettings.deliveryHours || { start: '09:00', end: '21:00' };
    // Not a delivery day
    if (deliveryDays.length > 0 && !deliveryDays.includes(currentDay)) {
        const nextDeliveryDay = getNextDeliveryDay(deliveryDays, currentDay);
        const nextDeliveryTime = formatTime12Hour(deliveryHours.start);
        return {
            isDelivering: false,
            message: `Store closed today. Next delivery available on ${nextDeliveryDay} from ${nextDeliveryTime}`,
            shortMessage: `Next Delivery on ${nextDeliveryDay}`,
            nextDeliveryDay,
            nextDeliveryTime: deliveryHours.start,
            reason: 'closed_today',
        };
    }
    // Time check
    const currentTime = now.toLocaleTimeString('en-GB', {
        hour12: false,
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
    });
    const startTime = deliveryHours.start;
    const endTime = deliveryHours.end;
    if (currentTime >= startTime && currentTime <= endTime) {
        return {
            isDelivering: true,
            message: 'Same day delivery available',
            shortMessage: 'Same day delivery available',
            reason: 'open_now',
        };
    } else if (currentTime < startTime) {
        // Before opening
        const openingTime = formatTime12Hour(startTime);
        return {
            isDelivering: false,
            message: `Store opens today at ${openingTime}. Delivery available from ${openingTime} onwards`,
            shortMessage: `Opens Today at ${openingTime}`,
            nextDeliveryDay: 'Today',
            nextDeliveryTime: startTime,
            reason: 'before_opening',
        };
    } else {
        // After closing
        const nextDeliveryDay = getNextDeliveryDay(deliveryDays, currentDay);
        const nextDeliveryTime = formatTime12Hour(deliveryHours.start);
        return {
            isDelivering: false,
            message: `Store closed for today. Next delivery available ${nextDeliveryDay} from ${nextDeliveryTime}`,
            shortMessage: `Next Delivery ${nextDeliveryDay}`,
            nextDeliveryDay,
            nextDeliveryTime: deliveryHours.start,
            reason: 'after_closing',
        };
    }
};

// Find the best warehouse for delivery to a specific location using OSRM
warehouseSchema.statics.findBestWarehouseForDelivery = async function(customerLat, customerLng, customerPincode = null) {
    let warehouses = await this.find({ 
        status: 'active',
        'deliverySettings.isDeliveryEnabled': true,
        'location.lat': { $exists: true },
        'location.lng': { $exists: true }
    });
    
    if (warehouses.length === 0) {
        return null;
    }
    
    // Filter warehouses based on pincode if provided
    if (customerPincode) {
        warehouses = warehouses.filter(warehouse => {
            // 24x7 warehouses can deliver to any pincode
            if (warehouse.deliverySettings.is24x7Delivery) {
                return true;
            }
            // Custom warehouses must have the pincode in their delivery list
            return Array.isArray(warehouse.deliverySettings.deliveryPincodes) && 
                   warehouse.deliverySettings.deliveryPincodes.includes(customerPincode);
        });
        
        if (warehouses.length === 0) {
            console.log(`No warehouses found that can deliver to pincode ${customerPincode}`);
            return null;
        }
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

// Helper function to get next delivery day
function getNextDeliveryDay(deliveryDays, currentDay) {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayIndex = daysOfWeek.indexOf(currentDay);
    
    // If no delivery days specified, assume next day
    if (deliveryDays.length === 0) {
        return daysOfWeek[(currentDayIndex + 1) % 7];
    }
    
    // Find next delivery day
    for (let i = 1; i <= 7; i++) {
        const nextDayIndex = (currentDayIndex + i) % 7;
        const nextDay = daysOfWeek[nextDayIndex];
        if (deliveryDays.includes(nextDay)) {
            return nextDay;
        }
    }
    
    // Fallback to first delivery day
    return deliveryDays[0];
}

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