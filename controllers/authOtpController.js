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
  const otp = generateOtp();
  const sessionId = crypto.randomBytes(16).toString('hex');
  otpStore[sessionId] = { phone, otp, expires: Date.now() + 5 * 60 * 1000 };
  console.log('Generated OTP:', otp); // For testing
  const text = `Use ${otp} as One Time Password (OTP) to Get your Pie Certificates HTL`;
  try {
    const fullPhone = `91${phone}`;
    const url = `https://www.smsgatewayhub.com/api/mt/SendSMS?APIKey=${SMS_API_KEY}&senderid=${SENDER_ID}&channel=2&DCS=0&flashsms=0&number=${fullPhone}&text=${encodeURIComponent(text)}&route=clickhere&EntityId=${ENTITY_ID}&dlttemplateid=${TEMPLATE_ID}`;
    const response = await axios.get(url);
    res.json({ success: true, sessionId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

exports.verifyOtp = async (req, res) => {
  const { phone, otp, sessionId } = req.body;
  const record = otpStore[sessionId];
  if (!record || record.phone !== phone || record.otp !== otp || Date.now() > record.expires) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }
  delete otpStore[sessionId];
  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({
      name: '',
      email: '',
      phone,
      dateOfBirth: '',
      address: [],
      role: 'user',
      status: 'active',
    });
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
}; 