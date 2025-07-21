const mongoose = require('mongoose');

const newsletterSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true,
        lowercase: true
    },
    isSubscribed: { 
        type: Boolean, 
        default: true 
    },
    subscribedAt: { 
        type: Date, 
        default: Date.now 
    },
    source: {
        type: String,
        enum: ['footer', 'popup', 'checkout', 'other'],
        default: 'footer'
    },
    ipAddress: { 
        type: String 
    },
    userAgent: { 
        type: String 
    }
}, { timestamps: true });

// Add index for better query performance
newsletterSchema.index({ email: 1 });
newsletterSchema.index({ isSubscribed: 1 });

module.exports = mongoose.model('Newsletter', newsletterSchema); 