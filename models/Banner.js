const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
    image: { type: String, required: true },
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    bannerType: { type: String, enum: ['regular', 'banner1', 'banner2', 'banner3'], default: 'regular' },
}, { timestamps: true });

module.exports = mongoose.model('Banner', bannerSchema);