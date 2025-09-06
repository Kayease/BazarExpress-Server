const mongoose = require('mongoose');
const InvoiceCounter = require('../models/InvoiceCounter');

/**
 * Test script to verify continuous invoice numbering works correctly
 */

async function testInvoiceGeneration() {
  try {
    console.log('Testing continuous invoice generation...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.DB_URL|| 'mongodb+srv://BazarXpress:BazarXpress@ecommerce.w04dxu3.mongodb.net/?retryWrites=true&w=majority&appName=Ecommerce');
    console.log('Connected to MongoDB');
    
    // Test generating multiple invoice numbers
    const testCount = 5;
    const generatedInvoices = [];
    
    for (let i = 0; i < testCount; i++) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const dateKey = `${yyyy}${mm}${dd}`;
      
      const counterDoc = await InvoiceCounter.findOneAndUpdate(
        { counterType: 'global' },
        { $inc: { seq: 1 }, $setOnInsert: { counterType: 'global' } },
        { upsert: true, new: true }
      );
      
      const seqStr = String(counterDoc.seq).padStart(6, '0');
      const invoiceNumber = `INV-${dateKey}-${seqStr}`;
      
      generatedInvoices.push({
        sequence: counterDoc.seq,
        invoiceNumber: invoiceNumber,
        timestamp: new Date()
      });
      
      console.log(`Generated invoice ${i + 1}: ${invoiceNumber} (seq: ${counterDoc.seq})`);
    }
    
    console.log('\n=== Test Results ===');
    console.log('Generated invoices:');
    generatedInvoices.forEach((inv, index) => {
      console.log(`${index + 1}. ${inv.invoiceNumber} (sequence: ${inv.sequence})`);
    });
    
    // Verify sequences are continuous
    const sequences = generatedInvoices.map(inv => inv.sequence);
    const isContinuous = sequences.every((seq, index) => {
      if (index === 0) return true;
      return seq === sequences[index - 1] + 1;
    });
    
    console.log(`\nSequences are continuous: ${isContinuous ? '✅ YES' : '❌ NO'}`);
    
    // Show current counter state
    const currentCounter = await InvoiceCounter.findOne({ counterType: 'global' });
    console.log(`\nCurrent global counter state:`);
    console.log(`- Sequence: ${currentCounter.seq}`);
    console.log(`- Last updated: ${currentCounter.updatedAt}`);
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run test if this script is executed directly
if (require.main === module) {
  testInvoiceGeneration();
}

module.exports = testInvoiceGeneration;
