const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const Order = require('../models/Order');
const InvoiceCounter = require('../models/InvoiceCounter');

const MONGODB_URI = process.env.DB_URL || process.env.MONGODB_URI || process.env.MONGO_URI;

async function cleanupAndSetCounter() {
  if (!MONGODB_URI) {
    console.error('Missing DB connection string. Set DB_URL in server/.env');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  try {
    console.log('🧹 Cleaning up old counters and setting correct sequence...\n');

    // Step 1: Show current counters
    console.log('📊 Current counters in database:');
    const allCounters = await InvoiceCounter.find().sort({ dateKey: -1 });
    
    if (allCounters.length === 0) {
      console.log('  No counters found');
    } else {
      for (const counter of allCounters) {
        console.log(`  ${counter.dateKey}: sequence ${counter.seq}`);
      }
    }

    // Step 2: Remove all old counters
    console.log('\n️  Removing all old counters...');
    const deleteResult = await InvoiceCounter.deleteMany({});
    console.log(`  Deleted ${deleteResult.deletedCount} counter(s)`);

    // Step 3: Find your last invoice number (73)
    console.log('\n🔍 Finding your last invoice number...');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateKey = `${yyyy}${mm}${dd}`;
    const datePattern = `INV-${dateKey}-`;

    // Find all orders with today's invoice pattern
    const existingOrders = await Order.find({
      invoiceNumber: { $regex: `^${datePattern}` }
    }).sort({ invoiceNumber: -1 }).lean();

    console.log(`  Found ${existingOrders.length} existing orders for today`);

    let maxSequence = 0;
    
    if (existingOrders.length > 0) {
      // Extract sequence numbers from existing invoices
      for (const order of existingOrders) {
        if (order.invoiceNumber) {
          const match = order.invoiceNumber.match(/INV-\d{8}-(\d+)/);
          if (match) {
            const seq = parseInt(match[1], 10);
            maxSequence = Math.max(maxSequence, seq);
          }
        }
      }
      console.log(`  Highest existing sequence: ${maxSequence}`);
    } else {
      console.log('  No existing invoices found for today');
    }

    // Step 4: Set the counter to continue from your last series (73)
    const targetSequence = maxSequence; // This will be 73 based on your last invoice
    console.log(`\n⚙️  Setting counter for ${dateKey} to sequence ${targetSequence}`);
    
    const counter = await InvoiceCounter.findOneAndUpdate(
      { dateKey },
      { $set: { dateKey, seq: targetSequence } },
      { upsert: true, new: true }
    );

    console.log(`✅ Counter set successfully:`);
    console.log(`   Date: ${counter.dateKey}`);
    console.log(`   Sequence: ${counter.seq}`);
    console.log(`   Next invoice: INV-${counter.dateKey}-${String(counter.seq + 1).padStart(2, '0')}`);

    // Step 5: Test the next invoice generation
    console.log('\n🧪 Testing next invoice generation...');
    const testCounter = await InvoiceCounter.findOneAndUpdate(
      { dateKey },
      { $inc: { seq: 1 } },
      { new: true }
    );
    const testSeqStr = String(testCounter.seq).padStart(2, '0');
    const testInvoiceNumber = `INV-${dateKey}-${testSeqStr}`;
    
    console.log(`   Generated: ${testInvoiceNumber}`);
    
    // Reset the counter back (since this was just a test)
    await InvoiceCounter.findOneAndUpdate(
      { dateKey },
      { $inc: { seq: -1 } }
    );

    console.log('\n🎉 Cleanup and setup completed successfully!');
    console.log('📝 Summary:');
    console.log(`   - Removed all old counters`);
    console.log(`   - Set today's counter to sequence ${targetSequence}`);
    console.log(`   - Next invoice will be: INV-${dateKey}-${String(targetSequence + 1).padStart(2, '0')}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

cleanupAndSetCounter();
