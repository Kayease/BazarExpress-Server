const mongoose = require('mongoose');

const abandonedCartSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: false // Can be null for unregistered users
    },
    sessionId: { 
        type: String, 
        required: false // For tracking unregistered users
    },
    userEmail: { 
        type: String, 
        required: false 
    },
    userName: { 
        type: String, 
        required: false 
    },
    phone: { 
        type: String, 
        required: false 
    },
    items: [
        {
            productId: { 
                type: mongoose.Schema.Types.ObjectId, 
                ref: 'Product', 
                required: true 
            },
            productName: { type: String, required: true },
            productImage: { type: String, required: false },
            price: { type: Number, required: true },
            quantity: { type: Number, required: true, min: 1 },
            addedAt: { type: Date, default: Date.now }
        }
    ],
    totalValue: { 
        type: Number, 
        required: true, 
        default: 0 
    },
    abandonedAt: { 
        type: Date, 
        default: Date.now 
    },
    lastActivity: { 
        type: Date, 
        default: Date.now 
    },
    isRegistered: { 
        type: Boolean, 
        required: true 
    },
    remindersSent: { 
        type: Number, 
        default: 0 
    },
    lastReminderSent: { 
        type: Date, 
        required: false 
    },
    status: { 
        type: String, 
        enum: ['active', 'recovered', 'expired'], 
        default: 'active' 
    }
}, {
    timestamps: true
});

// Index for efficient queries
abandonedCartSchema.index({ userId: 1, status: 1 });
abandonedCartSchema.index({ sessionId: 1, status: 1 });
abandonedCartSchema.index({ abandonedAt: 1 });
abandonedCartSchema.index({ isRegistered: 1 });

// Calculate total value before saving
abandonedCartSchema.pre('save', function(next) {
    this.totalValue = this.items.reduce((total, item) => {
        return total + (item.price * item.quantity);
    }, 0);
    next();
});

module.exports = mongoose.model('AbandonedCart', abandonedCartSchema);