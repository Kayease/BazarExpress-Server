const mongoose = require('mongoose');
const InvoiceCounter = require('../models/InvoiceCounter');

/**
 * Migration script to convert from per-day invoice counters to continuous counter
 * This script will:
 * 1. Find the highest sequence number from all existing date-based counters
 * 2. Create a new global counter with that sequence number
 * 3. Optionally remove old date-based counters (commented out for safety)
 */

async function migrateInvoiceCounter() {
  try {
    console.log('Starting invoice counter migration...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.DB_URL|| 'mongodb+srv://BazarXpress:BazarXpress@ecommerce.w04dxu3.mongodb.net/?retryWrites=true&w=majority&appName=Ecommerce');
    console.log('Connected to MongoDB');
    
    // Find all existing date-based counters
    const existingCounters = await InvoiceCounter.find({ dateKey: { $exists: true } });
    console.log(`Found ${existingCounters.length} existing date-based counters`);
    
    if (existingCounters.length === 0) {
      console.log('No existing counters found. Creating new global counter starting from 0.');
      const newCounter = new InvoiceCounter({
        counterType: 'global',
        seq: 0
      });
      await newCounter.save();
      console.log('Created new global counter with seq: 0');
      return;
    }
    
    // Find the highest sequence number
    let maxSeq = 0;
    existingCounters.forEach(counter => {
      if (counter.seq > maxSeq) {
        maxSeq = counter.seq;
      }
    });
    
    console.log(`Highest sequence number found: ${maxSeq}`);
    
    // Check if global counter already exists
    const existingGlobalCounter = await InvoiceCounter.findOne({ counterType: 'global' });
    
    if (existingGlobalCounter) {
      console.log(`Global counter already exists with seq: ${existingGlobalCounter.seq}`);
      if (existingGlobalCounter.seq < maxSeq) {
        console.log(`Updating global counter from ${existingGlobalCounter.seq} to ${maxSeq}`);
        existingGlobalCounter.seq = maxSeq;
        await existingGlobalCounter.save();
        console.log('Global counter updated successfully');
      } else {
        console.log('Global counter is already up to date');
      }
    } else {
      // Create new global counter with the highest sequence number
      const newCounter = new InvoiceCounter({
        counterType: 'global',
        seq: maxSeq
      });
      await newCounter.save();
      console.log(`Created new global counter with seq: ${maxSeq}`);
    }
    
    // Optional: Remove old date-based counters (uncomment if you want to clean up)
    // console.log('Removing old date-based counters...');
    // const deleteResult = await InvoiceCounter.deleteMany({ dateKey: { $exists: true } });
    // console.log(`Removed ${deleteResult.deletedCount} old counters`);
    
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  migrateInvoiceCounter();
}

module.exports = migrateInvoiceCounter;
