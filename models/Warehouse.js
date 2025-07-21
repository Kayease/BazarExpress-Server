const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    location: {
        lat: { type: Number },
        lng: { type: Number },
    },
    contactPhone: { type: String },
    email: { type: String },
    capacity: { type: Number },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

warehouseSchema.statics.createWarehouse = function(input) {
    if (!input || typeof input !== 'object') {
        throw new Error('Invalid input: warehouse data is required');
    }
    const { name, address, location, contactPhone, email, capacity, status, userId } = input;
    if (!name || !address || !userId) {
        throw new Error('Missing required fields: name, address, userId');
    }
    return this.create({ name, address, location, contactPhone, email, capacity, status, userId });
};

warehouseSchema.statics.getWarehousesByUser = function(userId) {
    return this.find({ userId });
};

warehouseSchema.statics.getWarehouseById = function(id) {
    return this.findById(id);
};

warehouseSchema.statics.updateWarehouse = function(id, updates) {
    updates.updatedAt = new Date();
    return this.findByIdAndUpdate(id, updates, { new: true });
};

warehouseSchema.statics.deleteWarehouse = function(id) {
    return this.findByIdAndDelete(id);
};

module.exports = mongoose.model('Warehouse', warehouseSchema);