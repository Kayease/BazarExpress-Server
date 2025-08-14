const jwt = require('jsonwebtoken');
const User = require('../models/User');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// Authentication middleware
exports.isAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header missing or malformed.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // Verify the token and get user data
        // Use Mongoose to find the user by ID
        const user = await User.findById(decoded.id).populate('assignedWarehouses');
        
        // If user not found by ID but phone is available in token, try finding by phone
        if (!user && decoded.phone) {
            const userByPhone = await User.findUserByPhone(decoded.phone);
            if (userByPhone) {
                req.user = userByPhone;
                return next();
            }
        }
        // Add user to request object
        if (!user) return res.status(401).json({ error: 'User not found' });
        req.user = user; // Attach full user object, including role
        next();
    } catch (err) {
        // Handle JWT verification errors
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
};

// Admin authorization middleware
exports.isAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Role-based permission middleware
exports.hasPermission = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        next();
    };
};

// Warehouse-specific access middleware
exports.hasWarehouseAccess = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Admin has access to all warehouses
    if (req.user.role === 'admin') {
        return next();
    }
    
    // For warehouse-specific roles, check if they have assigned warehouses
    const warehouseSpecificRoles = ['product_inventory_management', 'order_warehouse_management'];
    
    if (warehouseSpecificRoles.includes(req.user.role)) {
        if (!req.user.assignedWarehouses || req.user.assignedWarehouses.length === 0) {
            return res.status(403).json({ error: 'No warehouses assigned to this user' });
        }
        
        // Add assigned warehouse IDs to request for filtering
        req.assignedWarehouseIds = req.user.assignedWarehouses.map(w => w._id.toString());
    }
    
    // For delivery boys, they can access warehouses but don't need assigned warehouses
    // (they work with orders assigned to them, not warehouse-specific)
    if (req.user.role === 'delivery_boy') {
        // Add assigned warehouse IDs if they exist, but don't require them
        if (req.user.assignedWarehouses && req.user.assignedWarehouses.length > 0) {
            req.assignedWarehouseIds = req.user.assignedWarehouses.map(w => w._id.toString());
        }
    }
    
    next();
};

// Check if user can access specific sections
exports.canAccessSection = (section) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const userRole = req.user.role;
        
        // Admin has access to everything
        if (userRole === 'admin') {
            return next();
        }
        
        // Define role permissions
        const rolePermissions = {
            'marketing_content_manager': [
                'banners', 'promocodes', 'blog', 'newsletter', 'notices', 'products'
            ],
            'customer_support_executive': [
                'users', 'enquiry', 'reviews', 'orders', 'warehouse'
            ],
            'report_finance_analyst': [
                'reports', 'invoice-settings', 'taxes', 'delivery'
            ],
            'order_warehouse_management': [
                'orders', 'warehouse'
            ],
            'product_inventory_management': [
                'products', 'brands', 'categories', 'warehouse'
            ],
            'delivery_boy': [
                'orders', 'warehouse'
            ],
        };
        
        const allowedSections = rolePermissions[userRole] || [];
        
        if (!allowedSections.includes(section)) {
            return res.status(403).json({ error: `Access denied to ${section} section` });
        }
        
        next();
    };
};

// Optional authentication middleware - doesn't fail if no token
exports.optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No token provided, continue without user
        return next();
    }
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).populate('assignedWarehouses');
        
        if (!user && decoded.phone) {
            const userByPhone = await User.findUserByPhone(decoded.phone);
            if (userByPhone) {
                req.user = userByPhone;
                return next();
            }
        }
        
        if (user) {
            req.user = user;
        }
        next();
    } catch (err) {
        // Invalid token, but continue without user
        next();
    }
};

// Standard authentication middleware (alias for isAuth)
exports.authenticateToken = exports.isAuth;

// Special warehouse access middleware for delivery boy OTP operations
exports.hasWarehouseAccessForDeliveryOtp = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Admin has access to all warehouses
    if (req.user.role === 'admin') {
        return next();
    }
    
    // For warehouse-specific roles, check if they have assigned warehouses
    const warehouseSpecificRoles = ['product_inventory_management', 'order_warehouse_management'];
    
    if (warehouseSpecificRoles.includes(req.user.role)) {
        if (!req.user.assignedWarehouses || req.user.assignedWarehouses.length === 0) {
            return res.status(403).json({ error: 'No warehouses assigned to this user' });
        }
        
        // Add assigned warehouse IDs to request for filtering
        req.assignedWarehouseIds = req.user.assignedWarehouses.map(w => w._id.toString());
    }
    
    // For delivery boys, skip warehouse access check for OTP operations
    // They will be validated at the order level in the controller
    if (req.user.role === 'delivery_boy') {
        return next();
    }
    
    next();
};