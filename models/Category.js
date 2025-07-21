const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    parentId: { type: String, default: "" },
    hide: { type: Boolean, default: false },
    popular: { type: Boolean, default: false },
    icon: { type: String, default: "Box" },
    description: { type: String },
    sortOrder: { type: Number, default: 0 },
    slug: { type: String },
    thumbnail: { type: String },
    showOnHome: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Category", categorySchema);