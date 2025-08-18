const express = require('express');
const bcrypt = require('bcryptjs');
const { isAuth, hasPermission } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');

const router = express.Router();

// Get all admin users (Super Admin only)
router.get('/', 
    isAuth, 
    hasPermission(['admin', 'order_warehouse_management', 'customer_support_executive']),
    async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;
            const search = req.query.search || '';
            const roleFilter = req.query.role;
            const includeAll = req.query.includeAll === 'true';

            let query = {};
            
            // Only exclude regular users if includeAll is not true
            if (!includeAll) {
                query.role = { $ne: 'user' }; // Only get admin users, not regular customers
            }

            // Filter by specific role if provided
            if (roleFilter && roleFilter !== 'all') {
                query.role = roleFilter;
            }

            // For warehouse managers, only show delivery Agents assigned to their warehouses
            if (req.user.role === 'order_warehouse_management' && req.assignedWarehouseIds) {
                if (roleFilter === 'delivery_boy' || !roleFilter) {
                    query.assignedWarehouses = { $in: req.assignedWarehouseIds };
                    if (!roleFilter) {
                        query.role = 'delivery_boy'; // Only show delivery Agents for warehouse managers if no role filter
                    }
                } else {
                    // Warehouse managers can only see delivery Agents
                    return res.json({ users: [], pagination: { currentPage: 1, totalPages: 0, totalUsers: 0, hasNext: false, hasPrev: false } });
                }
            }

            // For customer support executives, allow access to all users but with read-only permissions
            // They can see all users for support purposes

            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { phone: { $regex: search, $options: 'i' } }
                ];
            }

            const users = await User.find(query)
                .select('-password') // Exclude password field
                .populate('assignedWarehouses', 'name address')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            // Transform users to include warehouse IDs as strings for frontend filtering
            const transformedUsers = users.map(user => {
                const userObj = user.toObject();
                if (userObj.assignedWarehouses) {
                    userObj.assignedWarehouseIds = userObj.assignedWarehouses.map(warehouse => warehouse._id.toString());
                }
                return userObj;
            });

            const totalUsers = await User.countDocuments(query);

            res.json({
                users: transformedUsers,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalUsers / limit),
                    totalUsers,
                    hasNext: page < Math.ceil(totalUsers / limit),
                    hasPrev: page > 1
                }
            });
        } catch (err) {
            res.status(500).json({ error: 'Server error', details: err.message });
        }
    }
);

// Create new admin user (Super Admin only)
router.post('/', 
    isAuth, 
    hasPermission(['admin']),
    async (req, res) => {
        try {
            const { 
                name, 
                email, 
                phone, 
                password, 
                role, 
                assignedWarehouses = [] 
            } = req.body;

            // Validate required fields
            if (!name || !email || !password || !role) {
                return res.status(400).json({ 
                    error: 'Name, email, password, and role are required' 
                });
            }

            // Validate role
            const validRoles = [
                'user',
                'admin',
                'product_inventory_management',
                'order_warehouse_management', 
                'marketing_content_manager',
                'customer_support_executive',
                'report_finance_analyst',
                'delivery_boy'
            ];

            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: 'Invalid role specified' });
            }

            // Check if user already exists
            const existingUser = await User.findOne({ 
                $or: [{ email }, { phone }] 
            });

            if (existingUser) {
                return res.status(400).json({ 
                    error: 'User with this email or phone already exists' 
                });
            }

            // Validate warehouse assignments for roles that need them
            const warehouseRequiredRoles = ['product_inventory_management', 'order_warehouse_management', 'delivery_boy'];
            if (warehouseRequiredRoles.includes(role)) {
                if (!assignedWarehouses || assignedWarehouses.length === 0) {
                    return res.status(400).json({ 
                        error: 'This role requires at least one warehouse assignment' 
                    });
                }

                // Validate that all assigned warehouses exist
                const warehouseCount = await Warehouse.countDocuments({
                    _id: { $in: assignedWarehouses }
                });

                if (warehouseCount !== assignedWarehouses.length) {
                    return res.status(400).json({ 
                        error: 'One or more assigned warehouses do not exist' 
                    });
                }
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Create user
            const user = new User({
                name,
                email,
                phone,
                password: hashedPassword,
                role,
                status: 'active',
                assignedWarehouses: warehouseRequiredRoles.includes(role) ? assignedWarehouses : []
            });

            await user.save();

            // Return user without password
            const userResponse = await User.findById(user._id)
                .select('-password')
                .populate('assignedWarehouses', 'name address');

            res.status(201).json({
                success: true,
                message: 'Admin user created successfully',
                user: userResponse
            });

        } catch (err) {
            res.status(500).json({ error: 'Server error', details: err.message });
        }
    }
);

// Update admin user (Super Admin only)
router.put('/:userId', 
    isAuth, 
    hasPermission(['admin']),
    async (req, res) => {
        try {
            const { userId } = req.params;
            const { 
                name, 
                email, 
                phone, 
                role, 
                assignedWarehouses = [],
                status,
                password,
                dateOfBirth
            } = req.body;

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Prevent admin from changing their own role
            if (userId === req.user._id.toString() && role && role !== user.role) {
                return res.status(400).json({ 
                    error: 'You cannot change your own role' 
                });
            }

            // Validate role if provided
            if (role) {
                const validRoles = [
                    'user',
                    'admin',
                    'product_inventory_management',
                    'order_warehouse_management', 
                    'marketing_content_manager',
                    'customer_support_executive',
                    'report_finance_analyst',
                    'delivery_boy'
                ];

                if (!validRoles.includes(role)) {
                    return res.status(400).json({ error: 'Invalid role specified' });
                }
            }

            // Validate warehouse assignments for roles that need them
            const warehouseRequiredRoles = ['product_inventory_management', 'order_warehouse_management', 'delivery_boy'];
            const finalRole = role || user.role;
            
            if (warehouseRequiredRoles.includes(finalRole)) {
                if (!assignedWarehouses || assignedWarehouses.length === 0) {
                    return res.status(400).json({ 
                        error: 'This role requires at least one warehouse assignment' 
                    });
                }

                // Validate that all assigned warehouses exist
                const warehouseCount = await Warehouse.countDocuments({
                    _id: { $in: assignedWarehouses }
                });

                if (warehouseCount !== assignedWarehouses.length) {
                    return res.status(400).json({ 
                        error: 'One or more assigned warehouses do not exist' 
                    });
                }
            }

            // Hash password if provided
            let hashedPassword = null;
            if (password && password.trim() !== '') {
                const salt = await bcrypt.genSalt(10);
                hashedPassword = await bcrypt.hash(password, salt);
            }

            // Update user
            const updateData = {
                ...(name && { name }),
                ...(email && { email }),
                ...(phone && { phone }),
                ...(role && { role }),
                ...(status && { status }),
                ...(dateOfBirth !== undefined && { dateOfBirth }),
                ...(hashedPassword && { password: hashedPassword }),
                assignedWarehouses: warehouseRequiredRoles.includes(finalRole) ? assignedWarehouses : [],
                updatedAt: new Date()
            };

            const updatedUser = await User.findByIdAndUpdate(
                userId,
                updateData,
                { new: true }
            ).select('-password').populate('assignedWarehouses', 'name address');

            res.json({
                success: true,
                message: 'User updated successfully',
                user: updatedUser
            });

        } catch (err) {
            res.status(500).json({ error: 'Server error', details: err.message });
        }
    }
);

// Delete admin user (Super Admin only)
router.delete('/:userId', 
    isAuth, 
    hasPermission(['admin']),
    async (req, res) => {
        try {
            const { userId } = req.params;

            // Prevent admin from deleting themselves
            if (userId === req.user._id.toString()) {
                return res.status(400).json({ 
                    error: 'You cannot delete your own account' 
                });
            }

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            await User.findByIdAndDelete(userId);

            res.json({
                success: true,
                message: 'User deleted successfully'
            });

        } catch (err) {
            res.status(500).json({ error: 'Server error', details: err.message });
        }
    }
);

module.exports = router;