const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

function generateToken(user) {
    return jwt.sign({ id: user._id, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });
}

async function register(req, res, next) {
    try {
        const { name, email = '', phone, dateOfBirth = '' } = req.body;
        if (!name || !phone || !/^\d{10}$/.test(phone)) {
            return res.status(400).json({ message: 'Name and a valid 10-digit phone number are required.' });
        }
        
        // Check for existing user by phone number
        const existingByPhone = await User.findOne({ phone });
        if (existingByPhone) {
            return res.status(409).json({ message: 'A user with this phone number already exists. Please try a different phone number.' });
        }
        
        // Check for existing user by email if email is provided
        if (email && email.trim() !== '') {
            const existingByEmail = await User.findOne({ email: email.trim() });
            if (existingByEmail) {
                return res.status(409).json({ message: 'This email is already registered. Please use a different email.' });
            }
        }
        
        const user = await User.createUser({ name, email: email.trim(), phone, dateOfBirth });
        const token = generateToken(user);
        res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, dateOfBirth: user.dateOfBirth } });
    } catch (err) {
        // Handle MongoDB duplicate key errors
        if (err.code === 11000) {
            if (err.keyPattern && err.keyPattern.email) {
                return res.status(409).json({ message: 'This email is already registered. Please use a different email.' });
            }
            if (err.keyPattern && err.keyPattern.phone) {
                return res.status(409).json({ message: 'A user with this phone number already exists. Please try a different phone number.' });
            }
            return res.status(409).json({ message: 'A user already exists with this information.' });
        }
        next(err);
    }
}

async function login(req, res, next) {
    try {
        const { phone } = req.body;
        if (!phone || !/^\d{10}$/.test(phone)) {
            return res.status(400).json({ error: 'Valid phone number is required.' });
        }
        
        // Phone-based authentication - redirecting to OTP flow
        return res.status(400).json({ 
            error: 'Direct login not supported', 
            message: 'Please use OTP-based authentication via /auth/send-otp endpoint' 
        });
    } catch (err) {
        next(err);
    }
}

async function updateProfile(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized: user not found in request.' });
        }
        const userId = req.user._id || req.user.id;
        const { name, email, phone, dateOfBirth, address } = req.body;
        
        // Check for existing email if email is being updated
        if (email && email.trim() !== '') {
            const existingUser = await User.findOne({ 
                email: email.trim(), 
                _id: { $ne: userId } // Exclude current user
            });
            if (existingUser) {
                return res.status(409).json({ message: 'This email is already registered. Please use a different email.' });
            }
        }
        
        // Check for existing phone if phone is being updated
        if (phone && phone.trim() !== '') {
            const existingUser = await User.findOne({ 
                phone: phone.trim(), 
                _id: { $ne: userId } // Exclude current user
            });
            if (existingUser) {
                return res.status(409).json({ message: 'A user with this phone number already exists. Please try a different phone number.' });
            }
        }
        
        const update = {};
        if (name) update.name = name;
        if (email) update.email = email.trim();
        if (phone) update.phone = phone.trim();
        if (dateOfBirth) update.dateOfBirth = dateOfBirth;
        if (address) update.address = address;
        
        const user = await User.findByIdAndUpdate(userId, update, { new: true });
        res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, dateOfBirth: user.dateOfBirth, address: user.address || null, status: user.status, assignedWarehouses: user.assignedWarehouses || [] } });
    } catch (err) {
        // Handle MongoDB duplicate key errors
        if (err.code === 11000) {
            if (err.keyPattern && err.keyPattern.email) {
                return res.status(409).json({ message: 'This email is already registered. Please use a different email.' });
            }
            if (err.keyPattern && err.keyPattern.phone) {
                return res.status(409).json({ message: 'A user with this phone number already exists. Please try a different phone number.' });
            }
            return res.status(409).json({ message: 'A user already exists with this information.' });
        }
        next(err);
    }
}

async function getAllUsers(req, res, next) {
    try {
        // Permission check is handled by middleware (hasPermission and canAccessSection)
        // Allow both admin and customer_support_executive roles
        const users = await User.find({});
        res.json(users.map(u => ({
            id: u._id,
            name: u.name,
            email: u.email,
            role: u.role,
            phone: u.phone,
            dateOfBirth: u.dateOfBirth,
            address: u.address || null,
            status: u.status || 'active',
            assignedWarehouses: u.assignedWarehouses || []
        })));
    } catch (err) {
        next(err);
    }
}

async function deleteUser(req, res, next) {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const userId = req.params.id;
        await User.findByIdAndDelete(userId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function updateUserRole(req, res, next) {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const userId = req.params.id;
        const { role } = req.body;
        const validRoles = [
            'user', 
            'admin', 
            'product_inventory_management', 
            'order_warehouse_management', 
            'marketing_content_manager', 
            'customer_support_executive', 
            'report_finance_analyst'
        ];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        await User.findByIdAndUpdate(userId, { role });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function updateUserStatus(req, res, next) {
    try {
        // Permission check is handled by middleware (hasPermission and canAccessSection)
        // Allow both admin and customer_support_executive roles
        const userId = req.params.id;
        const { status } = req.body;
        
        // Validate status
        if (!['active', 'disabled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        // Get the target user first to check their role
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Role-based restrictions
        if (req.user.role === 'customer_support_executive') {
            // Customer Support Executive can only change status of regular customers (role: 'user')
            if (targetUser.role !== 'user') {
                return res.status(403).json({ 
                    error: 'Customer Support Executive can only change status of regular customers, not admin users' 
                });
            }
        }
        // Admin can change status of any user (no additional restrictions)
        
        // Update the user status
        const updatedUser = await User.findByIdAndUpdate(userId, { status }, { new: true });
        res.json({ success: true, status: updatedUser.status });
    } catch (err) {
        next(err);
    }
}

async function updateUserByAdmin(req, res, next) {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const userId = req.params.id;
        const { name, email, phone, dateOfBirth, address, role, status, assignedWarehouses } = req.body;
        const validRoles = [
            'user', 
            'admin', 
            'product_inventory_management', 
            'order_warehouse_management', 
            'marketing_content_manager', 
            'customer_support_executive', 
            'report_finance_analyst'
        ];
        const update = {};
        if (name) update.name = name;
        if (email) update.email = email;
        if (phone) update.phone = phone;
        if (dateOfBirth) update.dateOfBirth = dateOfBirth;
        if (address) update.address = address;
        if (role && validRoles.includes(role)) update.role = role;
        if (status && ['active', 'disabled'].includes(status)) update.status = status;
        if (assignedWarehouses !== undefined) update.assignedWarehouses = assignedWarehouses;
        const user = await User.findByIdAndUpdate(userId, update, { new: true });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            dateOfBirth: user.dateOfBirth,
            address: user.address || null,
            status: user.status,
            assignedWarehouses: user.assignedWarehouses || []
        });
    } catch (err) {
        // Handle MongoDB duplicate key errors
        if (err.code === 11000) {
            if (err.keyPattern && err.keyPattern.email) {
                return res.status(409).json({ error: 'EMAIL_EXISTS', message: 'Email already exists' });
            }
            if (err.keyPattern && err.keyPattern.phone) {
                return res.status(409).json({ error: 'PHONE_EXISTS', message: 'Phone number already exists' });
            }
            return res.status(409).json({ error: 'DUPLICATE_KEY', message: 'A user already exists with this information' });
        }
        console.error('Error in updateUserByAdmin:', err);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Failed to update user' });
    }
}

async function getProfile(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = req.user;
  res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth,
      address: user.address || null,
      status: user.status,
      assignedWarehouses: user.assignedWarehouses || []
    }
  });
}

async function getAllWarehouses(req, res, next) {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const warehouses = await Warehouse.find({});
        res.json(warehouses.map(w => ({
            id: w._id,
            name: w.name,
            address: w.address
        })));
    } catch (err) {
        next(err);
    }
}

module.exports = { register, login, updateProfile, getProfile, getAllUsers, deleteUser, updateUserRole, updateUserStatus, updateUserByAdmin, getAllWarehouses };