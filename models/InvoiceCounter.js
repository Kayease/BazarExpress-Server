const mongoose = require('mongoose');

// Tracks continuous invoice sequence counter to ensure unique incremental numbers
const invoiceCounterSchema = new mongoose.Schema({
    counterType: { type: String, required: true, unique: true, default: 'global' }, // Single global counter
    seq: { type: Number, required: true, default: 0 },
    updatedAt: { type: Date, default: Date.now }
});

invoiceCounterSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('InvoiceCounter', invoiceCounterSchema);


