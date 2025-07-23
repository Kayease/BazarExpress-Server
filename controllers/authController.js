const jwt = require('jsonwebtoken');
const User = require('../models/User');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

function generateToken(user) {
    return jwt.sign({ id: user._id, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });
}

async function register(req, res, next) {
    try {
        const { name, email = '', phone, dateOfBirth = '' } = req.body;
        if (!name || !phone || !/^\d{10}$/.test(phone)) {
            return res.status(400).json({ error: 'Name and valid phone number are required.' });
        }
        
        // Check for existing user by phone number
        const existingByPhone = await User.findOne({ phone });
        if (existingByPhone) {
            return res.status(409).json({ error: 'Phone number already registered.' });
        }
        
        const user = await User.createUser({ name, email, phone, dateOfBirth });
        const token = generateToken(user);
        res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, dateOfBirth: user.dateOfBirth } });
    } catch (err) {
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
            return res.status(401).json({ error: 'Unauthorized: user not found in request.' });
        }
        const userId = req.user._id || req.user.id;
        const { name, email, phone, dateOfBirth, address } = req.body;
        const update = {};
        if (name) update.name = name;
        if (email) update.email = email;
        if (phone) update.phone = phone;
        if (dateOfBirth) update.dateOfBirth = dateOfBirth;
        if (address) update.address = address;
        const user = await User.findByIdAndUpdate(userId, update, { new: true });
        res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, dateOfBirth: user.dateOfBirth, address: user.address || null, status: user.status } });
    } catch (err) {
        next(err);
    }
}

async function getAllUsers(req, res, next) {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const users = await User.find({});
        res.json(users.map(u => ({
            id: u._id,
            name: u.name,
            email: u.email,
            role: u.role,
            phone: u.phone,
            dateOfBirth: u.dateOfBirth,
            address: u.address || null,
            status: u.status || 'active'
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
        if (!['admin', 'user'].includes(role)) {
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
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const userId = req.params.id;
        const { status } = req.body;
        if (!['active', 'disabled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const user = await User.findByIdAndUpdate(userId, { status }, { new: true });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, status: user.status });
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
        const { name, email, phone, dateOfBirth, address, role, status } = req.body;
        const update = {};
        if (name) update.name = name;
        if (email) update.email = email;
        if (phone) update.phone = phone;
        if (dateOfBirth) update.dateOfBirth = dateOfBirth;
        if (address) update.address = address;
        if (role && ['admin', 'user'].includes(role)) update.role = role;
        if (status && ['active', 'disabled'].includes(status)) update.status = status;
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
            status: user.status
        });
    } catch (err) {
        next(err);
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
      status: user.status
    }
  });
}

module.exports = { register, login, updateProfile, getProfile, getAllUsers, deleteUser, updateUserRole, updateUserStatus, updateUserByAdmin };