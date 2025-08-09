const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');
const { isAuth, hasPermission } = require('../middleware/authMiddleware');

// Basic setup endpoints
router.get('/', (req, res) => {
    res.json({ message: 'Setup route is working' });
});

// Setup warehouse assignments (admin only)
router.post('/warehouse-assignments',
    isAuth,
    hasPermission(['admin']),
    async (req, res) => {
        try {
            // Import and run the setup script
            const setupWarehouseAssignments = require('../scripts/setupWarehouseAssignments');
            
            // Since we can't use console in API response, we'll capture results
            let results = {
                warehousesCreated: 0,
                usersUpdated: 0,
                messages: []
            };

            // Check existing warehouses
            const existingWarehouses = await Warehouse.find();
            results.messages.push(`Found ${existingWarehouses.length} existing warehouses`);
            
            let warehouses = [];
            
            if (existingWarehouses.length === 0) {
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
                results.warehousesCreated = warehouses.length;
                results.messages.push(`Created ${warehouses.length} default warehouses`);
            } else {
                warehouses = existingWarehouses;
            }

            // Find users needing warehouse assignments
            const warehouseRoles = ['product_inventory_management', 'order_warehouse_management'];
            const usersNeedingWarehouses = await User.find({
                role: { $in: warehouseRoles },
                $or: [
                    { assignedWarehouses: { $exists: false } },
                    { assignedWarehouses: { $size: 0 } }
                ]
            });

            results.messages.push(`Found ${usersNeedingWarehouses.length} users needing warehouse assignments`);

            // Assign warehouses to users
            for (const user of usersNeedingWarehouses) {
                let userAssignedWarehouses = [];
                
                if (user.role === 'product_inventory_management') {
                    // Assign first 2 warehouses
                    userAssignedWarehouses = warehouses.slice(0, 2).map(w => w._id);
                } else if (user.role === 'order_warehouse_management') {
                    // Assign all warehouses
                    userAssignedWarehouses = warehouses.map(w => w._id);
                }

                if (userAssignedWarehouses.length > 0) {
                    await User.findByIdAndUpdate(user._id, {
                        assignedWarehouses: userAssignedWarehouses
                    });
                    results.usersUpdated++;
                    results.messages.push(`Assigned ${userAssignedWarehouses.length} warehouses to user: ${user.phone || user.email || user.name || 'unknown'}`);
                }
            }

            res.json({
                success: true,
                message: 'Warehouse assignments setup completed',
                results: results
            });

        } catch (error) {
            console.error('Setup error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// Check user's warehouse assignments (authenticated users)
router.get('/my-warehouses',
    isAuth,
    async (req, res) => {
        try {
            const user = await User.findById(req.user._id).populate('assignedWarehouses');
            
            res.json({
                role: user.role,
                assignedWarehouses: user.assignedWarehouses || [],
                hasWarehouseAccess: user.assignedWarehouses && user.assignedWarehouses.length > 0
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

module.exports = router;
