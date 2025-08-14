const mongoose = require('mongoose');
const AbandonedCart = require('../models/AbandonedCart');
const User = require('../models/User');
const Product = require('../models/Product');
require('dotenv').config();

const MONGODB_URI = process.env.DB_URL;

async function populateAbandonedCarts() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Get some existing users and products
        const users = await User.find({ role: 'user' }).limit(3);
        const products = await Product.find().limit(10);

        if (products.length === 0) {
            console.log('No products found. Please add some products first.');
            return;
        }

        // Clear existing abandoned carts
        await AbandonedCart.deleteMany({});
        console.log('Cleared existing abandoned carts');

        const abandonedCarts = [];

        // Create abandoned carts for registered users
        if (users.length > 0) {
            for (let i = 0; i < Math.min(3, users.length); i++) {
                const user = users[i];
                const cartProducts = products.slice(i * 2, (i * 2) + 2); // 2 products per cart
                
                const items = cartProducts.map(product => ({
                    productId: product._id,
                    productName: product.name,
                    productImage: product.images && product.images.length > 0 ? product.images[0] : '',
                    price: product.price,
                    quantity: Math.floor(Math.random() * 3) + 1,
                    addedAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000) // Random time in last 24 hours
                }));

                // Calculate total value
                const totalValue = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

                abandonedCarts.push({
                    userId: user._id,
                    userName: user.name || 'User',
                    userEmail: user.email || '',
                    phone: user.phone || '',
                    items,
                    totalValue,
                    isRegistered: true,
                    abandonedAt: new Date(Date.now() - Math.random() * 12 * 60 * 60 * 1000), // Random time in last 12 hours
                    lastActivity: new Date(Date.now() - Math.random() * 6 * 60 * 60 * 1000), // Random time in last 6 hours
                    remindersSent: Math.floor(Math.random() * 3),
                    status: 'active'
                });
            }
        }

        // Create abandoned carts for unregistered users
        for (let i = 0; i < 4; i++) {
            const startIndex = i * 2;
            const endIndex = Math.min(startIndex + 2, products.length);
            const cartProducts = products.slice(startIndex, endIndex);
            
            if (cartProducts.length === 0) break;
            
            const items = cartProducts.map(product => ({
                productId: product._id,
                productName: product.name,
                productImage: product.images && product.images.length > 0 ? product.images[0] : '',
                price: product.price,
                quantity: Math.floor(Math.random() * 3) + 1,
                addedAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000)
            }));

            // Calculate total value
            const totalValue = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            abandonedCarts.push({
                sessionId: `session_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`,
                userName: `Guest User ${i + 1}`,
                userEmail: i % 2 === 0 ? `guest${i + 1}@example.com` : '',
                phone: `+91 ${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                items,
                totalValue,
                isRegistered: false,
                abandonedAt: new Date(Date.now() - Math.random() * 12 * 60 * 60 * 1000),
                lastActivity: new Date(Date.now() - Math.random() * 6 * 60 * 60 * 1000),
                remindersSent: Math.floor(Math.random() * 2),
                status: 'active'
            });
        }

        // Insert all abandoned carts
        const result = await AbandonedCart.insertMany(abandonedCarts);
        console.log(`Created ${result.length} abandoned carts`);

        // Log summary
        const registeredCount = result.filter(cart => cart.isRegistered).length;
        const unregisteredCount = result.filter(cart => !cart.isRegistered).length;
        const totalValue = result.reduce((sum, cart) => sum + cart.totalValue, 0);

        console.log('\nSummary:');
        console.log(`- Registered users: ${registeredCount}`);
        console.log(`- Unregistered users: ${unregisteredCount}`);
        console.log(`- Total value: ₹${totalValue}`);
        console.log(`- Average value: ₹${Math.round(totalValue / result.length)}`);

    } catch (error) {
        console.error('Error populating abandoned carts:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
populateAbandonedCarts();