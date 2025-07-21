const mongoose = require('mongoose');

const taxSchema = new mongoose.Schema({
    name: { type: String, required: true },
    percentage: { type: Number, required: true },
    isInclusive: { type: Boolean, default: false },
    applicableFor: { type: String, enum: ['product', 'shipping', 'both'], required: true },
    country: { type: String },
    state: { type: String },
    description: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('Tax', taxSchema);