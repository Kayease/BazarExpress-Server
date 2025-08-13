const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Hardcoded SMS Gateway config (for debugging, as requested)
const SMS_API_KEY = process.env.SMS_API_KEY;
const SENDER_ID = process.env.SENDER_ID;
const ENTITY_ID = process.env.ENTITY_ID;
const TEMPLATE_ID = process.env.TEMPLATE_ID; // Use env var or default for testing
// JWT secret for signing tokens
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

const otpStore = {};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(user) {
  return jwt.sign(
    { id: user._id, phone: user.phone }, // use phone instead of email
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

exports.sendOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  // Check if user exists and their role
  let user = await User.findOne({ phone });
  let requiresPassword = false;
  
  if (user && user.requiresPassword()) {
    requiresPassword = true;
  }

  // For admin users (requiresPassword = true), don't send OTP yet
  // Just return the requiresPassword flag so frontend can show password step
  if (requiresPassword) {
    const sessionId = crypto.randomBytes(16).toString('hex');
    otpStore[sessionId] = { phone, expires: Date.now() + 5 * 60 * 1000, requiresPassword };
    res.json({ success: true, sessionId, requiresPassword, userRole: user?.role || null });
    return;
  }

  // For regular customers, send OTP immediately
  const otp = generateOtp();
  const sessionId = crypto.randomBytes(16).toString('hex');
  otpStore[sessionId] = { phone, otp, expires: Date.now() + 5 * 60 * 1000, requiresPassword };
  console.log('Generated OTP for customer:', otp); // For testing
  const text = `Use ${otp} as One Time Password (OTP) to Get your Pie Certificates HTL`;
  try {
    const fullPhone = `91${phone}`;
    const url = `https://www.smsgatewayhub.com/api/mt/SendSMS?APIKey=${SMS_API_KEY}&senderid=${SENDER_ID}&channel=2&DCS=0&flashsms=0&number=${fullPhone}&text=${encodeURIComponent(text)}&route=clickhere&EntityId=${ENTITY_ID}&dlttemplateid=${TEMPLATE_ID}`;
    const response = await axios.get(url);
    res.json({ success: true, sessionId, requiresPassword, userRole: user?.role || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

// New endpoint for password verification before OTP
exports.verifyPassword = async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone number and password are required' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user requires password authentication
    if (!user.requiresPassword()) {
      return res.status(400).json({ error: 'Password authentication not required for this user role' });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Password is valid, now send OTP
    const otp = generateOtp();
    const sessionId = crypto.randomBytes(16).toString('hex');
    otpStore[sessionId] = { 
      phone, 
      otp, 
      expires: Date.now() + 5 * 60 * 1000, 
      requiresPassword: true,
      passwordVerified: true 
    };
    
    // Clean up any existing sessions for this phone to prevent conflicts
    Object.keys(otpStore).forEach(key => {
      if (otpStore[key].phone === phone && !otpStore[key].passwordVerified) {
        delete otpStore[key];
      }
    });
    
    console.log('Generated OTP after password verification:', otp); // For testing
    const text = `Use ${otp} as One Time Password (OTP) to Get your Pie Certificates HTL`;
    
    try {
      const fullPhone = `91${phone}`;
      const url = `https://www.smsgatewayhub.com/api/mt/SendSMS?APIKey=${SMS_API_KEY}&senderid=${SENDER_ID}&channel=2&DCS=0&flashsms=0&number=${fullPhone}&text=${encodeURIComponent(text)}&route=clickhere&EntityId=${ENTITY_ID}&dlttemplateid=${TEMPLATE_ID}`;
      const response = await axios.get(url);
      res.json({ success: true, sessionId, message: 'Password verified. OTP sent successfully.' });
    } catch (err) {
      res.status(500).json({ error: 'Password verified but failed to send OTP' });
    }
  } catch (err) {
    console.error('Password verification error:', err);
    res.status(500).json({ message: 'Internal server error during password verification' });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp, sessionId } = req.body;
    const record = otpStore[sessionId];
    if (!record || record.phone !== phone || record.otp !== otp || Date.now() > record.expires) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    // For users that require password, ensure password was verified first
    if (record.requiresPassword && !record.passwordVerified) {
      return res.status(400).json({ error: 'Password verification required before OTP verification' });
    }
    
    delete otpStore[sessionId];
    let user = await User.findOne({ phone });
    if (!user) {
      // Only create new users for 'user' role (regular customers)
      if (record.requiresPassword) {
        return res.status(404).json({ error: 'User account not found. Please contact administrator.' });
      }
      
      try {
        user = await User.createUser({
          name: '',
          // Don't pass empty email - let the createUser method handle it
          phone,
          dateOfBirth: ''
        });
      } catch (err) {
        // Handle MongoDB duplicate key errors
        if (err.code === 11000) {
          if (err.keyPattern && err.keyPattern.phone) {
            return res.status(409).json({ message: 'A user with this phone number already exists. Please try a different phone number.' });
          }
          return res.status(409).json({ message: 'A user already exists with this information.' });
        }
        throw err;
      }
    }
    const token = generateToken(user);
    // Format the response consistently with other auth endpoints
    res.json({
      token,
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
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ message: 'Internal server error during verification' });
  }
}; 