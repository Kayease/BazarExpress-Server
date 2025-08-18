const axios = require('axios');
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");
const Warehouse = require("../models/Warehouse");
require("dotenv").config();

const API_BASE_URL = 'http://localhost:4000/api';
const MONGODB_URI = process.env.DB_URL;

async function testStockTransferAPI() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        // Get admin user for authentication
        const adminUser = await User.findOne({ role: 'admin' });
        if (!adminUser) {
            console.log("No admin user found. Please create an admin user first.");
            return;
        }

        // Create a JWT token for testing (simplified)
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
        console.log("\n=== Testing Stock Transfer API ===");
        const warehousesResponse = await axios.get(`${API_BASE_URL}/warehouses`, { headers });
        const warehouses = warehousesResponse.data.slice(0, 2);
        
        if (warehouses.length < 2) {
            console.log("Need at least 2 warehouses for testing");
            return;
        }

        console.log(`From Warehouse: ${warehouses[0].name} (${warehouses[0]._id})`);
        console.log(`To Warehouse: ${warehouses[1].name} (${warehouses[1]._id})`);

        // Get products from first warehouse
        const productsResponse = await axios.get(
            `${API_BASE_URL}/products/paginated?warehouse=${warehouses[0]._id}&limit=2`, 
            { headers }
        );
        const products = productsResponse.data.products.filter(p => p.stock > 10);

        if (products.length < 2) {
            console.log("Need at least 2 products with sufficient stock for testing");
            return;
        }

        console.log(`Products to transfer:`);
        products.forEach(p => console.log(`  - ${p.name} (SKU: ${p.sku}, Stock: ${p.stock})`));

        // Test 1: Create stock transfer
        console.log("\n--- Test 1: Creating Stock Transfer via API ---");
        
        const transferData = {
            fromWarehouse: warehouses[0]._id,
            toWarehouse: warehouses[1]._id,
            items: [
                { productId: products[0]._id, quantity: 5 },
                { productId: products[1]._id, quantity: 3 }
            ],
            notes: "API test transfer"
        };

        const createResponse = await axios.post(
            `${API_BASE_URL}/stock-transfers`,
            transferData,
            { headers }
        );

        console.log(`✓ Stock transfer created: ${createResponse.data.data.transferId}`);
        console.log(`Status: ${createResponse.data.data.status}`);
        const transferId = createResponse.data.data._id;

        // Verify stock was deducted
        const updatedProductsResponse = await axios.get(
            `${API_BASE_URL}/products/paginated?warehouse=${warehouses[0]._id}&limit=10`, 
            { headers }
        );
        const updatedProducts = updatedProductsResponse.data.products;
        const updatedProduct1 = updatedProducts.find(p => p._id === products[0]._id);
        const updatedProduct2 = updatedProducts.find(p => p._id === products[1]._id);
        
        console.log(`Stock after creation - Product 1: ${updatedProduct1?.stock}, Product 2: ${updatedProduct2?.stock}`);

        // Test 2: Get transfer details
        console.log("\n--- Test 2: Getting Transfer Details ---");
        const detailsResponse = await axios.get(
            `${API_BASE_URL}/stock-transfers/${transferId}`,
            { headers }
        );
        console.log(`✓ Retrieved transfer: ${detailsResponse.data.data.transferId}`);
        console.log(`Items count: ${detailsResponse.data.data.items.length}`);

        // Test 3: Update status to in-transit
        console.log("\n--- Test 3: Updating Status to In-Transit ---");
        const inTransitResponse = await axios.patch(
            `${API_BASE_URL}/stock-transfers/${transferId}/status`,
            { status: 'in-transit', notes: 'Started shipping' },
            { headers }
        );
        console.log(`✓ Status updated to: ${inTransitResponse.data.data.status}`);

        // Test 4: Complete the transfer
        console.log("\n--- Test 4: Completing Transfer ---");
        const completeResponse = await axios.patch(
            `${API_BASE_URL}/stock-transfers/${transferId}/status`,
            { status: 'completed', notes: 'Transfer completed successfully' },
            { headers }
        );
        console.log(`✓ Transfer completed: ${completeResponse.data.data.transferId}`);

        // Verify stock was transferred to destination
        const destProductsResponse = await axios.get(
            `${API_BASE_URL}/products/paginated?warehouse=${warehouses[1]._id}&limit=20`, 
            { headers }
        );
        const destProducts = destProductsResponse.data.products;
        
        console.log("\n--- Final Stock Status ---");
        console.log(`Destination warehouse products with matching SKUs:`);
        
        const destProduct1 = destProducts.find(p => p.sku === products[0].sku);
        const destProduct2 = destProducts.find(p => p.sku === products[1].sku);
        
        if (destProduct1) {
            console.log(`  - ${destProduct1.name} (SKU: ${destProduct1.sku}, Stock: ${destProduct1.stock})`);
        }
        if (destProduct2) {
            console.log(`  - ${destProduct2.name} (SKU: ${destProduct2.sku}, Stock: ${destProduct2.stock})`);
        }

        // Test 5: Get transfer statistics
        console.log("\n--- Test 5: Getting Transfer Statistics ---");
        const statsResponse = await axios.get(
            `${API_BASE_URL}/stock-transfers/stats`,
            { headers }
        );
        console.log(`✓ Statistics retrieved:`);
        console.log(`  Total transfers: ${statsResponse.data.data.totalTransfers}`);
        console.log(`  Completed: ${statsResponse.data.data.completedCount}`);
        console.log(`  Total value: ₹${statsResponse.data.data.totalValue}`);

        // Test 6: Test cancellation
        console.log("\n--- Test 6: Testing Cancellation ---");
        
        // Create another transfer to cancel
        const cancelTransferData = {
            fromWarehouse: warehouses[0]._id,
            toWarehouse: warehouses[1]._id,
            items: [{ productId: products[0]._id, quantity: 2 }],
            notes: "Transfer to be cancelled"
        };

        const cancelCreateResponse = await axios.post(
            `${API_BASE_URL}/stock-transfers`,
            cancelTransferData,
            { headers }
        );

        const cancelTransferId = cancelCreateResponse.data.data._id;
        console.log(`✓ Created transfer to cancel: ${cancelCreateResponse.data.data.transferId}`);

        // Cancel it
        const cancelResponse = await axios.patch(
            `${API_BASE_URL}/stock-transfers/${cancelTransferId}/status`,
            { status: 'cancelled', notes: 'Cancelled for testing' },
            { headers }
        );
        console.log(`✓ Transfer cancelled: ${cancelResponse.data.data.status}`);

        // Test 7: List all transfers
        console.log("\n--- Test 7: Listing All Transfers ---");
        const listResponse = await axios.get(
            `${API_BASE_URL}/stock-transfers?page=1&limit=10`,
            { headers }
        );
        console.log(`✓ Retrieved ${listResponse.data.data.length} transfers`);
        console.log(`Total count: ${listResponse.data.pagination.total}`);

        console.log("\n=== Stock Transfer API Test Completed Successfully! ===");

    } catch (error) {
        console.error("API Test failed:", error.response?.data || error.message);
        if (error.response?.status) {
            console.error(`HTTP Status: ${error.response.status}`);
        }
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    }
}

// Run the API test
testStockTransferAPI();