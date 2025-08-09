const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');

const MONGODB_URI = process.env.DB_URL;

async function setupWarehouseAssignments() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Create default warehouses if none exist
        const existingWarehouses = await Warehouse.find();
        console.log(`Found ${existingWarehouses.length} existing warehouses`);
        
        let warehouses = [];
        
        if (existingWarehouses.length === 0) {
            console.log('Creating default warehouses...');
            
            const defaultWarehouses = [
                {
                    name: 'Main Warehouse',
                    address: 'Main Street, City Center, Mumbai, Maharashtra, India',
                    location: { lat: 19.0760, lng: 72.8777 },
                    contactPhone: '9876543210',
                    email: 'main@warehouse.com',
                    capacity: 10000,
                    deliverySettings: {
                        isDeliveryEnabled: true,
                        deliveryPincodes: ['400001', '400002', '400003', '400004', '400005'],
                        is24x7Delivery: true,
                        deliveryDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                    }
                },
                {
                    name: 'North Zone Warehouse',
                    address: 'Industrial Area, North Zone, Delhi, India', 
                    location: { lat: 28.6139, lng: 77.2090 },
                    contactPhone: '9876543211',
                    email: 'north@warehouse.com',
                    capacity: 8000,
                    deliverySettings: {
                        isDeliveryEnabled: true,
                        deliveryPincodes: ['110001', '110002', '110003', '110004', '110005'],
                        is24x7Delivery: false,
                        deliveryDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                    }
                },
                {
                    name: 'South Zone Warehouse',
                    address: 'Tech Park, Electronic City, Bangalore, Karnataka, India',
                    location: { lat: 12.9716, lng: 77.5946 },
                    contactPhone: '9876543212', 
                    email: 'south@warehouse.com',
                    capacity: 7500,
                    deliverySettings: {
                        isDeliveryEnabled: true,
                        deliveryPincodes: ['560001', '560002', '560003', '560100', '560103'],
                        is24x7Delivery: true,
                        deliveryDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                    }
                }
            ];

            warehouses = await Warehouse.insertMany(defaultWarehouses);
            console.log(`✅ Created ${warehouses.length} default warehouses`);
        } else {
            warehouses = existingWarehouses;
            console.log(`✅ Using ${warehouses.length} existing warehouses`);
        }

        // 2. Find and update the test user (phone: 8875965312)
        const testUser = await User.findOne({ phone: '8875965312' });
        
        if (!testUser) {
            console.log('❌ Test user with phone 8875965312 not found');
            return;
        }

        console.log(`Found test user: ${testUser.name || 'Unnamed'} (${testUser.phone}) - Role: ${testUser.role}`);

        // 3. Assign warehouses based on role
        let assignedWarehouses = [];
        
        if (testUser.role === 'product_inventory_management') {
            // Assign 2-3 warehouses for product inventory management
            assignedWarehouses = warehouses.slice(0, 2).map(w => w._id);
        } else if (testUser.role === 'order_warehouse_management') {
            // Assign all warehouses for order/warehouse management
            assignedWarehouses = warehouses.map(w => w._id);
        } else if (testUser.role === 'admin') {
            // Admin has access to all warehouses (handled in middleware)
            assignedWarehouses = [];
        } else {
            // Other roles don't need warehouse assignments
            assignedWarehouses = [];
        }

        if (assignedWarehouses.length > 0) {
            // Update user with warehouse assignments
            const updatedUser = await User.findByIdAndUpdate(
                testUser._id,
                { assignedWarehouses: assignedWarehouses },
                { new: true }
            ).populate('assignedWarehouses');

            console.log(`✅ Assigned ${assignedWarehouses.length} warehouses to user ${testUser.phone}`);
            console.log('Assigned warehouses:', updatedUser.assignedWarehouses.map(w => w.name));
        } else {
            console.log(`ℹ️  No warehouse assignments needed for role: ${testUser.role}`);
        }

        // 4. Check for other users who might need warehouse assignments
        const warehouseRoles = ['product_inventory_management', 'order_warehouse_management'];
        const usersNeedingWarehouses = await User.find({
            role: { $in: warehouseRoles },
            $or: [
                { assignedWarehouses: { $exists: false } },
                { assignedWarehouses: { $size: 0 } }
            ]
        });

        console.log(`Found ${usersNeedingWarehouses.length} other users needing warehouse assignments`);

        for (const user of usersNeedingWarehouses) {
            let userAssignedWarehouses = [];
            
            if (user.role === 'product_inventory_management') {
                userAssignedWarehouses = warehouses.slice(0, 2).map(w => w._id);
            } else if (user.role === 'order_warehouse_management') {
                userAssignedWarehouses = warehouses.map(w => w._id);
            }

            if (userAssignedWarehouses.length > 0) {
                await User.findByIdAndUpdate(user._id, { 
                    assignedWarehouses: userAssignedWarehouses 
                });
                console.log(`✅ Assigned warehouses to user: ${user.phone || user.email || user.name}`);
            }
        }

        console.log('\n🎉 Warehouse assignment setup completed successfully!');

        // 5. Display summary
        const warehouseList = await Warehouse.find().select('name address');
        console.log('\n📦 Available Warehouses:');
        warehouseList.forEach((w, index) => {
            console.log(`${index + 1}. ${w.name} - ${w.address}`);
        });

        const roleUsersCount = await User.countDocuments({ 
            role: { $in: warehouseRoles } 
        });
        console.log(`\n👥 Users with warehouse roles: ${roleUsersCount}`);

    } catch (error) {
        console.error('❌ Error setting up warehouse assignments:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Check if this script is run directly
if (require.main === module) {
    setupWarehouseAssignments();
}

module.exports = setupWarehouseAssignments;