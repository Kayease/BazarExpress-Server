const mongoose = require('mongoose');
const AbandonedCart = require('../models/AbandonedCart');
const AbandonedCartService = require('../services/abandonedCartService');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bazar', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

async function testDuplicatePrevention() {
    try {
        console.log('🧪 Testing Duplicate Entry Prevention...\n');

        const sessionId = 'test_session_' + Date.now();
        
        // Test 1: Add items to cart
        console.log('1️⃣ Adding items to cart...');
        const cartItems1 = [
            {
                productId: new mongoose.Types.ObjectId(),
                productName: 'Test Product 1',
                productImage: 'test1.jpg',
                price: 100,
                quantity: 2,
                addedAt: new Date()
            }
        ];
        
        const result1 = await AbandonedCartService.trackUnregisteredUserCart(sessionId, cartItems1, {
            name: 'Test User',
            email: 'test@example.com',
            phone: '1234567890'
        });
        
        console.log('✅ Cart 1 created:', result1 ? 'Yes' : 'No');
        
        // Test 2: Update cart with same session ID
        console.log('\n2️⃣ Updating cart with same session ID...');
        const cartItems2 = [
            {
                productId: new mongoose.Types.ObjectId(),
                productName: 'Test Product 2',
                productImage: 'test2.jpg',
                price: 150,
                quantity: 1,
                addedAt: new Date()
            }
        ];
        
        const result2 = await AbandonedCartService.trackUnregisteredUserCart(sessionId, cartItems2, {
            name: 'Test User Updated',
            email: 'test@example.com',
            phone: '1234567890'
        });
        
        console.log('✅ Cart 2 updated:', result2 ? 'Yes' : 'No');
        
        // Test 3: Check for duplicate entries
        console.log('\n3️⃣ Checking for duplicate entries...');
        const allCarts = await AbandonedCart.find({ sessionId });
        console.log(`📊 Total carts with session ID: ${allCarts.length}`);
        
        if (allCarts.length === 1) {
            console.log('✅ SUCCESS: No duplicate entries created!');
        } else {
            console.log('❌ FAILED: Duplicate entries found!');
        }
        
        // Test 4: Clear cart
        console.log('\n4️⃣ Clearing cart...');
        const result3 = await AbandonedCartService.trackUnregisteredUserCart(sessionId, [], {});
        console.log('✅ Cart cleared:', result3 === null ? 'Yes' : 'No');
        
        // Test 5: Check cart status after clearing
        console.log('\n5️⃣ Checking cart status after clearing...');
        const clearedCarts = await AbandonedCart.find({ sessionId, status: 'recovered' });
        console.log(`📊 Recovered carts: ${clearedCarts.length}`);
        
        if (clearedCarts.length === 1) {
            console.log('✅ SUCCESS: Cart properly marked as recovered!');
        } else {
            console.log('❌ FAILED: Cart not properly recovered!');
        }
        
        // Test 6: Add items again (should create new entry)
        console.log('\n6️⃣ Adding items again after clearing...');
        const cartItems3 = [
            {
                productId: new mongoose.Types.ObjectId(),
                productName: 'Test Product 3',
                productImage: 'test3.jpg',
                price: 200,
                quantity: 1,
                addedAt: new Date()
            }
        ];
        
        const result4 = await AbandonedCartService.trackUnregisteredUserCart(sessionId, cartItems3, {
            name: 'Test User Again',
            email: 'test@example.com',
            phone: '1234567890'
        });
        
        console.log('✅ New cart created after clearing:', result4 ? 'Yes' : 'No');
        
        // Test 7: Final check
        console.log('\n7️⃣ Final verification...');
        const finalCarts = await AbandonedCart.find({ sessionId });
        const activeCarts = finalCarts.filter(cart => cart.status === 'active');
        const recoveredCarts = finalCarts.filter(cart => cart.status === 'recovered');
        
        console.log(`📊 Total carts: ${finalCarts.length}`);
        console.log(`📊 Active carts: ${activeCarts.length}`);
        console.log(`📊 Recovered carts: ${recoveredCarts.length}`);
        
        if (activeCarts.length === 1 && recoveredCarts.length === 1) {
            console.log('✅ SUCCESS: Duplicate prevention working correctly!');
        } else {
            console.log('❌ FAILED: Duplicate prevention not working!');
        }
        
        // Cleanup test data
        console.log('\n🧹 Cleaning up test data...');
        await AbandonedCart.deleteMany({ sessionId });
        console.log('✅ Test data cleaned up');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

// Run the test
console.log('🚀 Duplicate Entry Prevention Test');
console.log('=====================================\n');
testDuplicatePrevention();
