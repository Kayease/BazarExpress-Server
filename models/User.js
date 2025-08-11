const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: false, default: "" },
    email: { type: String, required: false, unique: true, sparse: true },
    password: { type: String, required: false }, // Password for non-user roles
    role: { 
        type: String, 
        enum: [
            'user', 
            'admin', 
            'product_inventory_management', 
            'order_warehouse_management', 
            'marketing_content_manager', 
            'customer_support_executive', 
            'report_finance_analyst'
        ], 
        default: 'user' 
    },
    assignedWarehouses: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Warehouse' 
    }],
    phone: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    address: [
        {
            id: { type: mongoose.Schema.Types.Mixed }, // can be number or string from frontend
            type: { type: String, enum: ["Office", "Home", "Hotel", "Other"], default: "Home" },
            building: { type: String, default: '' },
            floor: { type: String, default: '' },
            area: { type: String, default: '' },
            landmark: { type: String, default: '' },
            city: { type: String, default: '' },
            state: { type: String, default: '' },
            pincode: { type: String, default: '' },
            phone: { type: String, default: '' },
            country: { type: String, default: 'India' },
            name: { type: String, default: '' },
            lat: { type: Number },
            lng: { type: Number },
            isDefault: { type: Boolean, default: false },
            addressLabel: { type: String, default: '' },
            additionalInstructions: { type: String, default: '' },
            isActive: { type: Boolean, default: true },
            createdAt: { type: Number, default: () => Date.now() },
            updatedAt: { type: Number, default: () => Date.now() }
        }
    ],
    cart: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            quantity: { type: Number, required: true, min: 1 },
            addedAt: { type: Date, default: Date.now }
        }
    ],
    wishlist: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            addedAt: { type: Date, default: Date.now }
        }
    ],
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    createdAt: { type: Date, default: Date.now },
});

userSchema.statics.createUser = async function({ name = '', email = '', role = 'user', phone, dateOfBirth = '' }) {
    if (!phone) {
        throw new Error('Phone number is required');
    }
    
    const userData = {
        name,
        role,
        phone,
        dateOfBirth
    };
    
    // Email is optional
    if (email) userData.email = email;
    
    const user = new this(userData);
    return user.save();
};

userSchema.statics.findUserByPhone = function(phone) {
    return this.findOne({ phone });
};

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) {
        return false;
    }
    return bcrypt.compare(candidatePassword, this.password);
};

// Check if user requires password authentication
userSchema.methods.requiresPassword = function() {
    return this.role !== 'user';
};

module.exports = mongoose.model('User', userSchema);