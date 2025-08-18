const mongoose = require('mongoose');
const AbandonedCart = require('../models/AbandonedCart');
const User = require('../models/User');
const Product = require('../models/Product');
require('dotenv').config();

const MONGODB_URI = process.env.DB_URL;

async function createTestAbandonedCarts() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        
        // Get some users and products for testing
        const users = await User.find({ role: 'user' }).limit(3);
        const products = await Product.find().limit(5);
        
        if (users.length === 0) {
            console.log('No users found. Please create some users first.');
            return;
        }
        
        if (products.length === 0) {
            console.log('No products found. Please create some products first.');
            return;
        }
        
        console.log(`Found ${users.length} users and ${products.length} products`);
        
        // Create test abandoned carts for registered users
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const cartItems = [];
            
            // Add 2-4 random products to each cart
            const numItems = Math.floor(Math.random() * 3) + 2;
            const shuffledProducts = products.sort(() => 0.5 - Math.random());
            
            for (let j = 0; j < numItems; j++) {
                const product = shuffledProducts[j];
                cartItems.push({
                    productId: product._id,
                    productName: product.name,
                    productImage: product.images && product.images.length > 0 ? product.images[0] : '',
                    price: product.price,
                    quantity: Math.floor(Math.random() * 3) + 1,
                    addedAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000) // Random time in last 24 hours
                });
            }
            
            const totalValue = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            const abandonedCart = new AbandonedCart({
                userId: user._id,
                userName: user.name || 'Test User',
                userEmail: user.email || '',
                phone: user.phone || '',
                items: cartItems,
                totalValue,
                isRegistered: true,
                abandonedAt: new Date(Date.now() - Math.random() * 2 * 60 * 60 * 1000), // Random time in last 2 hours
                lastActivity: new Date(Date.now() - Math.random() * 60 * 60 * 1000), // Random time in last hour
                status: 'active',
                remindersSent: Math.floor(Math.random() * 3)
            });
            
            await abandonedCart.save();
            console.log(`✅ Created abandoned cart for ${user.name || user.phone} with ${cartItems.length} items (₹${totalValue})`);
        }
        
        // Create test abandoned carts for unregistered users
        const guestUsers = [
            { name: 'Guest User 1', email: 'guest1@example.com', phone: '9876543210' },
            { name: 'Guest User 2', email: 'guest2@example.com', phone: '9876543211' }
        ];
        
        for (const guest of guestUsers) {
            const cartItems = [];
            const numItems = Math.floor(Math.random() * 3) + 1;
            const shuffledProducts = products.sort(() => 0.5 - Math.random());
            
            for (let j = 0; j < numItems; j++) {
                const product = shuffledProducts[j];
                cartItems.push({
                    productId: product._id,
                    productName: product.name,
                    productImage: product.images && product.images.length > 0 ? product.images[0] : '',
                    price: product.price,
                    quantity: Math.floor(Math.random() * 3) + 1,
                    addedAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000)
                });
            }
            
            const totalValue = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            const abandonedCart = new AbandonedCart({
                sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                userName: guest.name,
                userEmail: guest.email,
                phone: guest.phone,
                items: cartItems,
                totalValue,
                isRegistered: false,
                abandonedAt: new Date(Date.now() - Math.random() * 2 * 60 * 60 * 1000),
                lastActivity: new Date(Date.now() - Math.random() * 60 * 60 * 1000),
                status: 'active',
                remindersSent: Math.floor(Math.random() * 2)
            });
            
            await abandonedCart.save();
            console.log(`✅ Created abandoned cart for ${guest.name} with ${cartItems.length} items (₹${totalValue})`);
        }
        
        console.log('\n🎉 Test abandoned carts created successfully!');
        console.log('You can now view them in the admin panel at /admin/abandoned-cart');
        
    } catch (error) {
        console.error('Error creating test abandoned carts:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
console.log('🚀 Test Abandoned Cart Creation Script');
console.log('=====================================');
createTestAbandonedCarts();
