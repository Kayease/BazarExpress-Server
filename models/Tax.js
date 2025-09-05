const mongoose = require('mongoose');

const taxSchema = new mongoose.Schema({
    name: { type: String, required: true },
    percentage: { type: Number, required: true },
    description: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    hsnCodes: {
        type: [String],
        default: [],
        validate: {
            validator: function(arr) {
                return arr.every(code => /^(\d{6}|\d{8})$/.test(String(code || '').trim()));
            },
            message: 'HSN codes must be 6 or 8 digit numbers'
        }
    }
}, { timestamps: true });

module.exports = mongoose.model('Tax', taxSchema);