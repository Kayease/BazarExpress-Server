const mongoose = require('mongoose');
const AbandonedCart = require('../models/AbandonedCart');
require('dotenv').config();

const MONGODB_URI = process.env.DB_URL;

async function testAbandonedCartAPI() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Test the abandoned cart functionality directly
        console.log('\n=== Testing Abandoned Cart Functionality ===\n');

        // Get all abandoned carts
        const allCarts = await AbandonedCart.find({ status: 'active' });
        console.log(`Total active abandoned carts: ${allCarts.length}`);

        // Get registered user carts
        const registeredCarts = await AbandonedCart.find({ 
            status: 'active', 
            isRegistered: true 
        });
        console.log(`Registered user carts: ${registeredCarts.length}`);

        // Get unregistered user carts
        const unregisteredCarts = await AbandonedCart.find({ 
            status: 'active', 
            isRegistered: false 
        });
        console.log(`Unregistered user carts: ${unregisteredCarts.length}`);

        // Calculate total value
        const totalValue = allCarts.reduce((sum, cart) => sum + cart.totalValue, 0);
        console.log(`Total abandoned value: ₹${totalValue}`);

        // Show sample carts
        console.log('\n=== Sample Abandoned Carts ===\n');
        
        if (registeredCarts.length > 0) {
            console.log('Registered User Cart:');
            const regCart = registeredCarts[0];
            console.log(`- User: ${regCart.userName} (${regCart.userEmail})`);
            console.log(`- Items: ${regCart.items.length}`);
            console.log(`- Total: ₹${regCart.totalValue}`);
            console.log(`- Abandoned: ${regCart.abandonedAt}`);
            console.log(`- Reminders sent: ${regCart.remindersSent}`);
        }

        if (unregisteredCarts.length > 0) {
            console.log('\nUnregistered User Cart:');
            const unregCart = unregisteredCarts[0];
            console.log(`- User: ${unregCart.userName} (${unregCart.userEmail || 'No email'})`);
            console.log(`- Phone: ${unregCart.phone}`);
            console.log(`- Items: ${unregCart.items.length}`);
            console.log(`- Total: ₹${unregCart.totalValue}`);
            console.log(`- Abandoned: ${unregCart.abandonedAt}`);
            console.log(`- Reminders sent: ${unregCart.remindersSent}`);
        }

        // Test pagination
        console.log('\n=== Testing Pagination ===\n');
        const page1 = await AbandonedCart.find({ status: 'active' })
            .limit(3)
            .skip(0)
            .sort({ abandonedAt: -1 });
        console.log(`Page 1 results: ${page1.length}`);

        const page2 = await AbandonedCart.find({ status: 'active' })
            .limit(3)
            .skip(3)
            .sort({ abandonedAt: -1 });
        console.log(`Page 2 results: ${page2.length}`);

        // Test search functionality
        console.log('\n=== Testing Search ===\n');
        const searchResults = await AbandonedCart.find({
            status: 'active',
            $or: [
                { userName: { $regex: 'Guest', $options: 'i' } },
                { userEmail: { $regex: 'guest', $options: 'i' } }
            ]
        });
        console.log(`Search results for "Guest": ${searchResults.length}`);

        console.log('\n=== API Test Completed Successfully ===');

    } catch (error) {
        console.error('Error testing abandoned cart API:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the test
testAbandonedCartAPI();