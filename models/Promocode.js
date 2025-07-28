const mongoose = require('mongoose');

const PromocodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    type: { type: String, enum: ['percentage', 'fixed'], required: true },
    discount: { type: Number, required: true },
    maxDiscount: { type: Number },
    minOrderAmount: { type: Number },
    usageLimit: { type: Number },
    usageType: { type: String, enum: ['single_use', 'multiple_use'], default: 'multiple_use' },
    usedBy: [{ 
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
        orderId: { type: String }
    }],
    totalUsed: { type: Number, default: 0 },
    startDate: { type: Date },
    endDate: { type: Date },
    appliesTo: { type: String, enum: ['all', 'categories', 'brands', 'products'], default: 'all' },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    brands: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    status: { type: Boolean, default: true },
    description: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Promocode', PromocodeSchema);