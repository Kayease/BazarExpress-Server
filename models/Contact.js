const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    category: { type: String, enum: ['general', 'order', 'technical', 'feedback'], default: 'general' },
    categoryLabel: { type: String, default: 'General Inquiry' },
    status: { type: String, enum: ['new', 'read', 'replied'], default: 'new' },
    ipAddress: { type: String },
    userAgent: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Contact', contactSchema); 