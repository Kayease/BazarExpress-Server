const mongoose = require('mongoose');
require('dotenv').config();

// Import the Order model
const Order = require('../models/Order');

const MONGODB_URI = process.env.DB_URL;

async function migratePaymentStatus() {
    try {
        console.log('🔄 Starting payment status migration...');
        
        // Connect to MongoDB
        console.log('📡 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB successfully!');

        // Get all orders
        console.log('📖 Fetching all orders...');
        const orders = await Order.find({});
        console.log(`📊 Found ${orders.length} orders to process`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const order of orders) {
            let newPaymentStatus = null;

            // Determine the correct payment status based on the new logic
            if (order.status === 'cancelled' || order.status === 'refunded') {
                newPaymentStatus = 'refunded';
            } else if (order.status === 'delivered' && order.paymentInfo.method === 'cod') {
                newPaymentStatus = 'paid';
            } else if (order.paymentInfo.method === 'cod') {
                newPaymentStatus = 'pending';
            } else if (order.paymentInfo.method === 'online') {
                newPaymentStatus = 'prepaid';
            }

            // Check if the payment status needs to be updated
            if (newPaymentStatus && order.paymentInfo.status !== newPaymentStatus) {
                console.log(`🔄 Updating order ${order.orderId}: ${order.paymentInfo.status} → ${newPaymentStatus}`);
                
                // Update the payment status
                order.paymentInfo.status = newPaymentStatus;
                await order.save();
                
                updatedCount++;
            } else {
                skippedCount++;
            }
        }

        console.log('\n✅ Migration completed successfully!');
        console.log(`📊 Summary:`);
        console.log(`   Total orders processed: ${orders.length}`);
        console.log(`   Orders updated: ${updatedCount}`);
        console.log(`   Orders skipped (already correct): ${skippedCount}`);

    } catch (error) {
        console.error('❌ Error during migration:', error);
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

// Run the migration if this script is executed directly
if (require.main === module) {
    migratePaymentStatus()
        .then(() => {
            console.log('🎉 Migration script completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = migratePaymentStatus;
