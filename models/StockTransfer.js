const mongoose = require("mongoose");

const stockTransferItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true }
});

const stockTransferSchema = new mongoose.Schema({
    transferId: {
        type: String,
        unique: true
    },
    fromWarehouse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Warehouse",
        required: true
    },
    toWarehouse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Warehouse",
        required: true
    },
    items: [stockTransferItemSchema],
    totalItems: { type: Number, required: true },
    totalValue: { type: Number, required: true },
    status: {
        type: String,
        enum: ['pending', 'in-transit', 'completed', 'cancelled'],
        default: 'pending'
    },
    notes: { type: String },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    statusHistory: [{
        status: {
            type: String,
            enum: ['pending', 'in-transit', 'completed', 'cancelled']
        },
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        changedAt: {
            type: Date,
            default: Date.now
        },
        notes: String
    }],
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String }
}, { timestamps: true });

// Generate unique transfer ID
stockTransferSchema.pre('save', async function(next) {
    if (this.isNew && !this.transferId) {
        const year = new Date().getFullYear();
        const count = await this.constructor.countDocuments({
            createdAt: {
                $gte: new Date(year, 0, 1),
                $lt: new Date(year + 1, 0, 1)
            }
        });
        this.transferId = `TR-${year}-${String(count + 1).padStart(4, '0')}`;
    }
    next();
});

// Add status to history when status changes
stockTransferSchema.pre('save', function(next) {
    if (this.isModified('status') && !this.isNew) {
        this.statusHistory.push({
            status: this.status,
            changedBy: this.processedBy || this.createdBy,
            changedAt: new Date(),
            notes: this.notes
        });
        
        if (this.status === 'completed') {
            this.completedAt = new Date();
        } else if (this.status === 'cancelled') {
            this.cancelledAt = new Date();
        }
    }
    next();
});

// Validate that from and to warehouses are different
stockTransferSchema.pre('save', function(next) {
    if (this.fromWarehouse.toString() === this.toWarehouse.toString()) {
        const error = new Error('From warehouse and to warehouse cannot be the same');
        error.name = 'ValidationError';
        return next(error);
    }
    next();
});

module.exports = mongoose.model("StockTransfer", stockTransferSchema);