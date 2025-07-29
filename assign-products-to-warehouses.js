/**
 * Script to assign existing products to warehouses
 * This ensures products can be filtered by location
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const Warehouse = require('./models/Warehouse');

async function connectDB() {
    try {
        await mongoose.connect(process.env.DB_URL);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        process.exit(1);
    }
}

async function assignProductsToWarehouses() {
    try {
        console.log('🏪 Assigning products to warehouses...');
        
        // Get all active warehouses
        const warehouses = await Warehouse.find({ status: 'active' });
        console.log(`Found ${warehouses.length} active warehouses`);
        
        if (warehouses.length === 0) {
            console.log('❌ No active warehouses found. Please create warehouses first.');
            return;
        }
        
        // Get all products without warehouse assignment
        const productsWithoutWarehouse = await Product.find({
            $or: [
                { warehouseId: { $exists: false } },
                { warehouseId: null }
            ]
        });
        
        console.log(`Found ${productsWithoutWarehouse.length} products without warehouse assignment`);
        
        if (productsWithoutWarehouse.length === 0) {
            console.log('✅ All products already have warehouse assignments');
            return;
        }
        
        // Strategy: Distribute products evenly across warehouses
        let warehouseIndex = 0;
        let assignedCount = 0;
        
        for (const product of productsWithoutWarehouse) {
            const selectedWarehouse = warehouses[warehouseIndex];
            
            // Update product with warehouse assignment
            await Product.findByIdAndUpdate(product._id, {
                warehouseId: selectedWarehouse._id,
                warehouse: selectedWarehouse._id // Also update the warehouse field for consistency
            });
            
            assignedCount++;
            console.log(`✅ Assigned "${product.name}" to ${selectedWarehouse.name}`);
            
            // Move to next warehouse (round-robin distribution)
            warehouseIndex = (warehouseIndex + 1) % warehouses.length;
        }
        
        console.log(`\n🎉 Successfully assigned ${assignedCount} products to warehouses`);
        
        // Show distribution summary
        console.log('\n📊 Distribution Summary:');
        for (const warehouse of warehouses) {
            const productCount = await Product.countDocuments({ warehouseId: warehouse._id });
            console.log(`   ${warehouse.name}: ${productCount} products`);
        }
        
    } catch (error) {
        console.error('❌ Error assigning products to warehouses:', error);
    }
}

async function verifyAssignments() {
    try {
        console.log('\n🔍 Verifying assignments...');
        
        const totalProducts = await Product.countDocuments();
        const assignedProducts = await Product.countDocuments({ warehouseId: { $exists: true, $ne: null } });
        const unassignedProducts = totalProducts - assignedProducts;
        
        console.log(`Total products: ${totalProducts}`);
        console.log(`Assigned products: ${assignedProducts}`);
        console.log(`Unassigned products: ${unassignedProducts}`);
        
        if (unassignedProducts === 0) {
            console.log('✅ All products have warehouse assignments');
        } else {
            console.log(`⚠️  ${unassignedProducts} products still need warehouse assignment`);
        }
        
        // Test location-based product query
        console.log('\n🧪 Testing location-based product query...');
        const testLocation = { lat: 26.860459, lng: 75.772770 };
        
        // Get warehouses that can deliver to test location
        const warehouses = await Warehouse.find({ status: 'active' });
        const deliverableWarehouses = [];
        
        for (const warehouse of warehouses) {
            // Simple distance check (you can use OSRM here too)
            const distance = calculateHaversineDistance(
                warehouse.location.lat,
                warehouse.location.lng,
                testLocation.lat,
                testLocation.lng
            );
            
            if (distance <= warehouse.deliverySettings.maxDeliveryRadius) {
                deliverableWarehouses.push(warehouse._id);
            }
        }
        
        const deliverableProducts = await Product.countDocuments({
            warehouseId: { $in: deliverableWarehouses },
            status: 'active',
            stock: { $gt: 0 }
        });
        
        console.log(`Products available for delivery to test location: ${deliverableProducts}`);
        
    } catch (error) {
        console.error('❌ Error verifying assignments:', error);
    }
}

// Helper function for distance calculation
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

async function main() {
    console.log('🚀 Starting Product-Warehouse Assignment...');
    console.log('==========================================');
    
    await connectDB();
    await assignProductsToWarehouses();
    await verifyAssignments();
    
    console.log('\n✅ Assignment process completed!');
    await mongoose.connection.close();
}

main().catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
});