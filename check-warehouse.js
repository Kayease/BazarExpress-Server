/**
 * Check warehouse locations and delivery radius
 */

require('dotenv').config();
const mongoose = require('mongoose');
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

async function checkWarehouses() {
    try {
        const warehouses = await Warehouse.find({});
        
        console.log('📦 Active Warehouses:');
        console.log('=====================');
        
        warehouses.forEach((warehouse, index) => {
            console.log(`${index + 1}. ${warehouse.name}`);
            console.log(`   Location: ${warehouse.location.lat}, ${warehouse.location.lng}`);
            console.log(`   Address: ${warehouse.address}`);
            console.log(`   Max Delivery Radius: ${warehouse.deliverySettings.maxDeliveryRadius} km`);
            console.log(`   Free Delivery Radius: ${warehouse.deliverySettings.freeDeliveryRadius} km`);
            console.log('');
        });
        
        // Test coordinates (Delhi area)
        const testLat = 28.5355;
        const testLng = 77.3910;
        
        console.log(`🎯 Testing delivery to: ${testLat}, ${testLng} (Noida)`);
        console.log('=====================');
        
        for (const warehouse of warehouses) {
            const distance = calculateDistance(
                warehouse.location.lat,
                warehouse.location.lng,
                testLat,
                testLng
            );
            
            const canDeliver = distance <= warehouse.deliverySettings.maxDeliveryRadius;
            
            console.log(`${warehouse.name}:`);
            console.log(`   Distance: ${distance.toFixed(2)} km`);
            console.log(`   Can deliver: ${canDeliver ? '✅ Yes' : '❌ No'}`);
            console.log('');
        }
        
        // Suggest coordinates near Jaipur warehouse
        const jaipur = warehouses[0];
        if (jaipur) {
            console.log('💡 Suggested test coordinates near warehouse:');
            console.log('=====================');
            console.log(`Near ${jaipur.name}:`);
            console.log(`Lat: ${jaipur.location.lat + 0.01} (${(jaipur.location.lat + 0.01).toFixed(6)})`);
            console.log(`Lng: ${jaipur.location.lng + 0.01} (${(jaipur.location.lng + 0.01).toFixed(6)})`);
            console.log('This should be within delivery range.');
        }
        
    } catch (error) {
        console.error('❌ Error checking warehouses:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('✅ Database connection closed');
    }
}

// Helper function for distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
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

connectDB().then(checkWarehouses);