const mongoose = require("mongoose");
const Product = require("../models/Product");
const Warehouse = require("../models/Warehouse");
require("dotenv").config();

const MONGODB_URI = process.env.DB_URL;

async function addTestStock() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        // Get first warehouse
        const warehouse = await Warehouse.findOne();
        if (!warehouse) {
            console.log("No warehouse found");
            return;
        }

        console.log(`Adding stock to products in warehouse: ${warehouse.name}`);

        // Find products in the warehouse and add stock
        const products = await Product.find({ warehouse: warehouse._id }).limit(5);
        
        for (const product of products) {
            await Product.findByIdAndUpdate(product._id, { 
                stock: 50,
                sku: product.sku || `SKU-${product._id.toString().slice(-6)}`
            });
            console.log(`✓ Updated ${product.name} - Stock: 50, SKU: ${product.sku || `SKU-${product._id.toString().slice(-6)}`}`);
        }

        console.log("Stock update completed!");

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    }
}

addTestStock();