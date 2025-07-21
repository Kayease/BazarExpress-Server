const jwt = require('jsonwebtoken');
const User = require('../models/User');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

function generateToken(user) {
    return jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

async function register(req, res, next) {
    try {
        const { name, email, password, phone = '', dateOfBirth = '' } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }
        const existing = await User.findUserByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered.' });
        }
        const user = await User.createUser({ name, email, password, phone, dateOfBirth });
        const token = generateToken(user);
        res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, dateOfBirth: user.dateOfBirth } });
    } catch (err) {
        next(err);
    }
}

async function login(req, res, next) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        const user = await User.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        if (user.status && user.status !== 'active') {
            return res.status(403).json({ error: 'Your account is disabled. Please contact support.' });
        }
        const valid = await user.validatePassword(password);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        const token = generateToken(user);
        res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, dateOfBirth: user.dateOfBirth, address: user.address || null, status: user.status } });
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
        const { name, phone, dateOfBirth, address } = req.body;
        console.log('updateProfile - incoming body:', req.body);
        const update = {};
        if (name) update.name = name;
        if (phone) update.phone = phone;
        if (dateOfBirth) update.dateOfBirth = dateOfBirth;
        if (address) update.address = address;
        console.log('updateProfile - update object:', update);
        const user = await User.findByIdAndUpdate(userId, update, { new: true });
        console.log('updateProfile - updated user:', user);
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
        const users = await User.find({}, { password: 0 });
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
        console.log('updateUserByAdmin - incoming body:', req.body);
        const update = {};
        if (name) update.name = name;
        if (email) update.email = email;
        if (phone) update.phone = phone;
        if (dateOfBirth) update.dateOfBirth = dateOfBirth;
        if (address) update.address = address;
        if (role && ['admin', 'user'].includes(role)) update.role = role;
        if (status && ['active', 'disabled'].includes(status)) update.status = status;
        console.log('updateUserByAdmin - update object:', update);
        const user = await User.findByIdAndUpdate(userId, update, { new: true });
        console.log('updateUserByAdmin - updated user:', user);
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

module.exports = { register, login, updateProfile, getAllUsers, deleteUser, updateUserRole, updateUserStatus, updateUserByAdmin };