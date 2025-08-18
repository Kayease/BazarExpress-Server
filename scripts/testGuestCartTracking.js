const mongoose = require('mongoose');
const AbandonedCartService = require('../services/abandonedCartService');
require('dotenv').config();

const MONGODB_URI = process.env.DB_URL;

async function testGuestCartTracking() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        
        console.log('🧪 Testing Guest Cart Tracking...');
        
        // Simulate a guest user adding items to cart
        const sessionId = `test_session_${Date.now()}`;
        const cartItems = [
            {
                productId: '507f1f77bcf86cd799439011', // Mock product ID
                productName: 'Test Product 1',
                productImage: 'https://example.com/image1.jpg',
                price: 299,
                quantity: 2
            },
            {
                productId: '507f1f77bcf86cd799439012', // Mock product ID
                productName: 'Test Product 2',
                productImage: 'https://example.com/image2.jpg',
                price: 199,
                quantity: 1
            }
        ];
        
        const userInfo = {
            name: 'Test Guest User',
            email: 'guest@test.com',
            phone: '9876543210'
        };
        
        console.log('\n📝 Simulating guest user adding items to cart...');
        console.log(`Session ID: ${sessionId}`);
        console.log(`Items: ${cartItems.length}`);
        console.log(`Total Value: ₹${cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)}`);
        
        // Track the cart
        const result = await AbandonedCartService.trackUnregisteredUserCart(sessionId, cartItems, userInfo);
        
        if (result) {
            console.log('✅ Guest cart tracked successfully!');
            console.log(`Cart ID: ${result._id}`);
            console.log(`Status: ${result.status}`);
        } else {
            console.log('❌ Failed to track guest cart');
        }
        
        // Now let's check all abandoned carts
        console.log('\n🔍 Checking all abandoned carts...');
        const allCarts = await AbandonedCartService.getAllAbandonedCarts();
        console.log(`Total abandoned carts: ${allCarts.length}`);
        
        allCarts.forEach((cart, index) => {
            console.log(`\n${index + 1}. ${cart.userName || 'Unknown User'}`);
            console.log(`   Type: ${cart.isRegistered ? 'Registered' : 'Guest'}`);
            console.log(`   Items: ${cart.items.length}`);
            console.log(`   Total Value: ₹${cart.totalValue}`);
            console.log(`   Status: ${cart.status}`);
        });
        
        // Get statistics
        const stats = await AbandonedCartService.getAbandonedCartStats();
        console.log('\n📊 Final Statistics:');
        console.log(`Total: ${stats.total}`);
        console.log(`Registered Users: ${stats.registered}`);
        console.log(`Unregistered Users: ${stats.unregistered}`);
        console.log(`Total Value: ₹${stats.totalValue.toLocaleString()}`);
        
        console.log('\n🎉 Guest cart tracking test completed!');
        
    } catch (error) {
        console.error('❌ Error during test:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the test
console.log('🚀 Guest Cart Tracking Test');
console.log('============================');
testGuestCartTracking();
