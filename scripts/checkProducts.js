const axios = require('axios');
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");
const Warehouse = require("../models/Warehouse");
require("dotenv").config();

const API_BASE_URL = 'http://localhost:4000/api';
const MONGODB_URI = process.env.DB_URL;

async function checkProducts() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        // Get admin user for authentication
        const adminUser = await User.findOne({ role: 'admin' });
        if (!adminUser) {
            console.log("No admin user found. Please create an admin user first.");
            return;
        }

        // Create a JWT token for testing
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { id: adminUser._id, role: adminUser.role },
            process.env.JWT_SECRET || 'changeme',
            { expiresIn: '1h' }
        );

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        // Get warehouses
        const warehousesResponse = await axios.get(`${API_BASE_URL}/warehouses`, { headers });
        const warehouses = warehousesResponse.data;
        console.log(`Found ${warehouses.length} warehouses`);

        if (warehouses.length > 0) {
            const warehouse = warehouses[0];
            console.log(`\nChecking products in warehouse: ${warehouse.name} (${warehouse._id})`);

            // Check products directly from database
            const dbProducts = await Product.find({ warehouse: warehouse._id });
            console.log(`\nDirect DB query - Found ${dbProducts.length} products:`);
            dbProducts.forEach(p => console.log(`  - ${p.name} (Stock: ${p.stock}, SKU: ${p.sku})`));

            // Check products via API
            try {
                const productsResponse = await axios.get(
                    `${API_BASE_URL}/products/paginated?warehouse=${warehouse._id}&limit=10`, 
                    { headers }
                );
                console.log(`\nAPI query - Found ${productsResponse.data.products?.length || 0} products:`);
                if (productsResponse.data.products) {
                    productsResponse.data.products.forEach(p => console.log(`  - ${p.name} (Stock: ${p.stockCount}, SKU: ${p.sku})`));
                }
            } catch (apiError) {
                console.error("API Error:", apiError.response?.data || apiError.message);
            }
        }

    } catch (error) {
        console.error("Error:", error.response?.data || error.message);
    } finally {
        await mongoose.disconnect();
        console.log("\nDisconnected from MongoDB");
    }
}

checkProducts();