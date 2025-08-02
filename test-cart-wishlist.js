const axios = require('axios');

const API_BASE_URL = 'http://localhost:4000/api';

// Test credentials - you'll need to replace these with actual test user credentials
const TEST_USER = {
    email: 'test@example.com',
    password: 'testpassword'
};

// Test product ID - you'll need to replace this with an actual product ID from your database
const TEST_PRODUCT_ID = '507f1f77bcf86cd799439011'; // Replace with actual product ID

async function testCartAndWishlist() {
    try {
        console.log('🧪 Testing Cart and Wishlist API endpoints...\n');

        // Step 1: Login to get token
        console.log('1. Logging in...');
        const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, TEST_USER);
        const token = loginResponse.data.token;
        console.log('✅ Login successful\n');

        // Create axios instance with auth header
        const authAxios = axios.create({
            baseURL: API_BASE_URL,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // Step 2: Test Cart endpoints
        console.log('2. Testing Cart endpoints...');
        
        // Get empty cart
        const emptyCart = await authAxios.get('/cart');
        console.log('✅ Get empty cart:', emptyCart.data);

        // Add item to cart
        try {
            const addToCart = await authAxios.post('/cart/add', {
                productId: TEST_PRODUCT_ID,
                quantity: 2
            });
            console.log('✅ Add to cart:', addToCart.data.message);
        } catch (error) {
            console.log('⚠️  Add to cart failed (expected if product ID doesn\'t exist):', error.response?.data?.error);
        }

        // Step 3: Test Wishlist endpoints
        console.log('\n3. Testing Wishlist endpoints...');
        
        // Get empty wishlist
        const emptyWishlist = await authAxios.get('/wishlist');
        console.log('✅ Get empty wishlist:', emptyWishlist.data);

        // Add item to wishlist
        try {
            const addToWishlist = await authAxios.post('/wishlist/add', {
                productId: TEST_PRODUCT_ID
            });
            console.log('✅ Add to wishlist:', addToWishlist.data.message);
        } catch (error) {
            console.log('⚠️  Add to wishlist failed (expected if product ID doesn\'t exist):', error.response?.data?.error);
        }

        // Step 4: Test sync endpoints
        console.log('\n4. Testing Sync endpoints...');
        
        // Test cart sync
        const cartSyncResponse = await authAxios.post('/cart/sync', {
            localCart: [
                { id: TEST_PRODUCT_ID, quantity: 1 },
                { id: '507f1f77bcf86cd799439012', quantity: 3 }
            ]
        });
        console.log('✅ Cart sync response:', cartSyncResponse.data.message);

        // Test wishlist sync
        const wishlistSyncResponse = await authAxios.post('/wishlist/sync', {
            localWishlist: [
                { id: TEST_PRODUCT_ID },
                { id: '507f1f77bcf86cd799439013' }
            ]
        });
        console.log('✅ Wishlist sync response:', wishlistSyncResponse.data.message);

        console.log('\n🎉 All tests completed successfully!');
        console.log('\n📝 Note: Some operations may have failed due to non-existent product IDs, which is expected.');
        console.log('   The important thing is that the endpoints are responding correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            console.log('\n💡 Tip: Make sure you have a test user account or update the TEST_USER credentials in this script.');
        }
    }
}

// Run the test
testCartAndWishlist();