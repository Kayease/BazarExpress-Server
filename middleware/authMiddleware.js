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
        // Use Mongoose to find the user
        const user = await User.findById(decoded.id);
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