cls
const mongoose = require('mongoose');
const AbandonedCart = require('../models/AbandonedCart');
require('dotenv').config();

const MONGODB_URI = process.env.DB_URL;

async function checkAbandonedCarts() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const carts = await AbandonedCart.find({});
        console.log(`\n📊 Found ${carts.length} abandoned carts in database:`);
        
        if (carts.length === 0) {
            console.log('No abandoned carts found.');
            return;
        }
        
        carts.forEach((cart, index) => {
            console.log(`\n${index + 1}. ${cart.userName || 'Unknown User'}`);
            console.log(`   Type: ${cart.isRegistered ? 'Registered' : 'Guest'}`);
            console.log(`   Items: ${cart.items.length}`);
            console.log(`   Total Value: ₹${cart.totalValue}`);
            console.log(`   Status: ${cart.status}`);
            console.log(`   Abandoned: ${cart.abandonedAt.toLocaleString()}`);
            console.log(`   Last Activity: ${cart.lastActivity.toLocaleString()}`);
        });
        
    } catch (error) {
        console.error('Error checking abandoned carts:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

// Run the script
console.log('🔍 Abandoned Cart Database Check');
console.log('=================================');
checkAbandonedCarts();
