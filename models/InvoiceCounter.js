const mongoose = require('mongoose');

// Tracks per-day invoice sequence counters to ensure unique incremental numbers
const invoiceCounterSchema = new mongoose.Schema({
    dateKey: { type: String, required: true, unique: true }, // Format: YYYY-MM-DD
    seq: { type: Number, required: true, default: 0 },
    updatedAt: { type: Date, default: Date.now }
});

invoiceCounterSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('InvoiceCounter', invoiceCounterSchema);


