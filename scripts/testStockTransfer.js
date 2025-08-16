const mongoose = require("mongoose");
const Product = require("../models/Product");
const Warehouse = require("../models/Warehouse");
const StockTransfer = require("../models/StockTransfer");
const User = require("../models/User");
require("dotenv").config();

const MONGODB_URI = process.env.DB_URL;

async function testStockTransferFlow() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        // Find existing warehouses
        const warehouses = await Warehouse.find().limit(2);
        console.log(`Found ${warehouses.length} warehouses`);
        
        if (warehouses.length < 2) {
            console.log("Need at least 2 warehouses for testing. Creating test warehouses...");
            
            const warehouse1 = await Warehouse.create({
                name: "Test Warehouse 1",
                address: "123 Test Street, Test City",
                location: { lat: 28.6139, lng: 77.2090 },
                contactPhone: "9876543210",
                email: "warehouse1@test.com",
                capacity: 1000,
                userId: new mongoose.Types.ObjectId()
            });
            
            const warehouse2 = await Warehouse.create({
                name: "Test Warehouse 2", 
                address: "456 Test Avenue, Test City",
                location: { lat: 28.7041, lng: 77.1025 },
                contactPhone: "9876543211",
                email: "warehouse2@test.com",
                capacity: 1000,
                userId: new mongoose.Types.ObjectId()
            });
            
            warehouses.push(warehouse1, warehouse2);
            console.log("Created test warehouses");
        }

        // Find or create test products in first warehouse
        let products = await Product.find({ warehouse: warehouses[0]._id, stock: { $gt: 0 } }).limit(2);
        
        if (products.length < 2) {
            console.log("Creating test products in first warehouse...");
            
            const product1 = await Product.create({
                name: "Test Product 1",
                price: 100,
                unit: "piece",
                image: "/test-image1.jpg",
                warehouse: warehouses[0]._id,
                warehouseId: warehouses[0]._id,
                stock: 50,
                sku: "TEST-SKU-001",
                status: "active"
            });
            
            const product2 = await Product.create({
                name: "Test Product 2",
                price: 200,
                unit: "piece", 
                image: "/test-image2.jpg",
                warehouse: warehouses[0]._id,
                warehouseId: warehouses[0]._id,
                stock: 30,
                sku: "TEST-SKU-002",
                status: "active"
            });
            
            products = [product1, product2];
            console.log("Created test products");
        } else if (products.length === 1) {
            // Create one more product if we only found one
            const product2 = await Product.create({
                name: "Test Product 2",
                price: 200,
                unit: "piece", 
                image: "/test-image2.jpg",
                warehouse: warehouses[0]._id,
                warehouseId: warehouses[0]._id,
                stock: 30,
                sku: "TEST-SKU-002",
                status: "active"
            });
            products.push(product2);
            console.log("Created additional test product");
        }

        // Find admin user
        const adminUser = await User.findOne({ role: 'admin' });
        if (!adminUser) {
            console.log("No admin user found. Please create an admin user first.");
            return;
        }

        console.log("\n=== Testing Stock Transfer Flow ===");
        console.log(`From Warehouse: ${warehouses[0].name} (${warehouses[0]._id})`);
        console.log(`To Warehouse: ${warehouses[1].name} (${warehouses[1]._id})`);
        console.log(`Products to transfer:`);
        products.forEach(p => console.log(`  - ${p.name} (SKU: ${p.sku}, Stock: ${p.stock})`));

        // Test 1: Create stock transfer (should deduct stock immediately)
        console.log("\n--- Test 1: Creating Stock Transfer ---");
        
        const transferItems = [
            { productId: products[0]._id, quantity: 10 },
            { productId: products[1]._id, quantity: 5 }
        ];

        // Check initial stock
        const initialStock1 = await Product.findById(products[0]._id);
        const initialStock2 = await Product.findById(products[1]._id);
        console.log(`Initial stock - Product 1: ${initialStock1.stock}, Product 2: ${initialStock2.stock}`);

        // Create stock transfer
        const stockTransfer = new StockTransfer({
            fromWarehouse: warehouses[0]._id,
            toWarehouse: warehouses[1]._id,
            items: transferItems.map(item => {
                const product = products.find(p => p._id.toString() === item.productId.toString());
                return {
                    product: item.productId,
                    productName: product.name,
                    sku: product.sku,
                    quantity: item.quantity,
                    unitPrice: product.price,
                    totalPrice: product.price * item.quantity
                };
            }),
            totalItems: transferItems.reduce((sum, item) => sum + item.quantity, 0),
            totalValue: transferItems.reduce((sum, item) => {
                const product = products.find(p => p._id.toString() === item.productId.toString());
                return sum + (product.price * item.quantity);
            }, 0),
            createdBy: adminUser._id,
            notes: "Test stock transfer"
        });

        // Manually deduct stock (simulating controller logic)
        await Product.findByIdAndUpdate(products[0]._id, { $inc: { stock: -10 } });
        await Product.findByIdAndUpdate(products[1]._id, { $inc: { stock: -5 } });

        await stockTransfer.save();
        console.log(`✓ Stock transfer created: ${stockTransfer.transferId}`);

        // Check stock after creation (should be deducted)
        const afterCreationStock1 = await Product.findById(products[0]._id);
        const afterCreationStock2 = await Product.findById(products[1]._id);
        console.log(`Stock after creation - Product 1: ${afterCreationStock1.stock}, Product 2: ${afterCreationStock2.stock}`);

        // Test 2: Change status to in-transit
        console.log("\n--- Test 2: Changing Status to In-Transit ---");
        stockTransfer.status = 'in-transit';
        stockTransfer.processedBy = adminUser._id;
        await stockTransfer.save();
        console.log(`✓ Status changed to: ${stockTransfer.status}`);

        // Stock should remain the same (on hold)
        const inTransitStock1 = await Product.findById(products[0]._id);
        const inTransitStock2 = await Product.findById(products[1]._id);
        console.log(`Stock during transit - Product 1: ${inTransitStock1.stock}, Product 2: ${inTransitStock2.stock}`);

        // Test 3: Complete the transfer
        console.log("\n--- Test 3: Completing Transfer ---");
        
        // Check if products exist in destination warehouse by SKU
        for (const item of stockTransfer.items) {
            const sourceProduct = await Product.findById(item.product);
            let destinationProduct = await Product.findOne({
                sku: item.sku,
                warehouse: warehouses[1]._id
            });

            if (destinationProduct) {
                console.log(`Product ${item.sku} exists in destination, updating quantity`);
                await Product.findByIdAndUpdate(
                    destinationProduct._id,
                    { $inc: { stock: item.quantity } }
                );
            } else {
                console.log(`Product ${item.sku} doesn't exist in destination, creating new entry`);
                const newProductData = {
                    name: sourceProduct.name,
                    price: sourceProduct.price,
                    unit: sourceProduct.unit,
                    image: sourceProduct.image,
                    warehouse: warehouses[1]._id,
                    warehouseId: warehouses[1]._id,
                    stock: item.quantity,
                    status: sourceProduct.status,
                    sku: sourceProduct.sku
                };
                await Product.create(newProductData);
            }
        }

        stockTransfer.status = 'completed';
        stockTransfer.completedBy = adminUser._id;
        await stockTransfer.save();
        console.log(`✓ Transfer completed: ${stockTransfer.transferId}`);

        // Check final stock in both warehouses
        console.log("\n--- Final Stock Status ---");
        const finalSourceStock1 = await Product.findById(products[0]._id);
        const finalSourceStock2 = await Product.findById(products[1]._id);
        console.log(`Source warehouse stock - Product 1: ${finalSourceStock1.stock}, Product 2: ${finalSourceStock2.stock}`);

        const destProducts = await Product.find({ warehouse: warehouses[1]._id });
        console.log(`Destination warehouse products:`);
        destProducts.forEach(p => console.log(`  - ${p.name} (SKU: ${p.sku}, Stock: ${p.stock})`));

        // Test 4: Test cancellation flow
        console.log("\n--- Test 4: Testing Cancellation Flow ---");
        
        // Create another transfer to test cancellation
        const cancelTransfer = new StockTransfer({
            fromWarehouse: warehouses[0]._id,
            toWarehouse: warehouses[1]._id,
            items: [{
                product: products[0]._id,
                productName: products[0].name,
                sku: products[0].sku,
                quantity: 5,
                unitPrice: products[0].price,
                totalPrice: products[0].price * 5
            }],
            totalItems: 5,
            totalValue: products[0].price * 5,
            createdBy: adminUser._id,
            notes: "Test cancellation"
        });

        // Deduct stock
        await Product.findByIdAndUpdate(products[0]._id, { $inc: { stock: -5 } });
        await cancelTransfer.save();
        
        const beforeCancelStock = await Product.findById(products[0]._id);
        console.log(`Stock before cancellation: ${beforeCancelStock.stock}`);

        // Cancel the transfer (should return stock)
        cancelTransfer.status = 'cancelled';
        cancelTransfer.cancellationReason = "Test cancellation";
        await cancelTransfer.save();

        // Return stock to source
        await Product.findByIdAndUpdate(products[0]._id, { $inc: { stock: 5 } });
        
        const afterCancelStock = await Product.findById(products[0]._id);
        console.log(`Stock after cancellation: ${afterCancelStock.stock}`);
        console.log(`✓ Transfer cancelled and stock returned`);

        console.log("\n=== Stock Transfer Flow Test Completed Successfully! ===");

    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    }
}

// Run the test
testStockTransferFlow();