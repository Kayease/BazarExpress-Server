const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    unit: { type: String, required: true },
    image: { type: String, required: true },
    rating: { type: Number, default: 0 },
    deliveryTime: { type: String },
    description: { type: String },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" }, // For easier querying
    tax: { type: mongoose.Schema.Types.ObjectId, ref: "Tax" },
    stock: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    // Advanced fields from the form:
    sku: { type: String },
    hsn: { type: String },
    priceIncludesTax: { type: Boolean, default: true }, // Changed default to true
    lowStockThreshold: { type: Number, default: 0 },
    weight: { type: Number },
    dimensions: {
        l: { type: String },
        w: { type: String },
        h: { type: String },
    },
    shippingClass: { type: String },
    returnable: { type: Boolean, default: false },
    returnWindow: { type: Number, default: 0 },
    codAvailable: { type: Boolean, default: false },
    mainImage: { type: String },
    galleryImages: [{ type: String }],
    metaTitle: { type: String },
    metaDescription: { type: String },
    metaKeywords: { type: String },
    locationName: { type: String, default: "" }, // New field for product location
    mrp: { type: Number, default: 0 },
    variants: { type: Object, default: {} },
    attributes: [{ name: String, values: [String] }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);