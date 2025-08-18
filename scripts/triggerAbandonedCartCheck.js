const mongoose = require('mongoose');
const AbandonedCartService = require('../services/abandonedCartService');
require('dotenv').config();

const MONGODB_URI = process.env.DB_URL;

async function triggerAbandonedCartCheck() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        
        console.log('🔍 Getting abandoned carts...');
        
        // Get all abandoned carts using the simplified approach
        const allCarts = await AbandonedCartService.getAllAbandonedCarts();
        console.log(`Found ${allCarts.length} abandoned carts`);
        
        // Show details of each cart
        allCarts.forEach((cart, index) => {
            console.log(`\n${index + 1}. ${cart.userName || 'Unknown User'}`);
            console.log(`   Type: ${cart.isRegistered ? 'Registered' : 'Guest'}`);
            console.log(`   Items: ${cart.items.length}`);
            console.log(`   Total Value: ₹${cart.totalValue}`);
            console.log(`   Status: ${cart.status}`);
        });
        
        // Get statistics
        const stats = await AbandonedCartService.getAbandonedCartStats();
        console.log('\n📊 Abandoned Cart Statistics:');
        console.log(`Total: ${stats.total}`);
        console.log(`Registered Users: ${stats.registered}`);
        console.log(`Unregistered Users: ${stats.unregistered}`);
        console.log(`Total Value: ₹${stats.totalValue.toLocaleString()}`);
        console.log(`Average Value: ₹${stats.averageValue.toLocaleString()}`);
        
        // Clean up expired abandoned carts
        console.log('\n🧹 Cleaning up expired carts...');
        await AbandonedCartService.cleanupExpiredCarts();
        
        console.log('\n✅ Abandoned cart check completed successfully!');
        
    } catch (error) {
        console.error('❌ Error during abandoned cart check:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
console.log('🚀 Abandoned Cart Check Trigger Script');
console.log('=====================================');
triggerAbandonedCartCheck();
