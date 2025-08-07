const mongoose = require("mongoose");

const BrandSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    logo: { type: String, required: true },
    bannerImage: { type: String },
    isPopular: { type: Boolean, default: false },
    showOnHome: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Brand", BrandSchema);