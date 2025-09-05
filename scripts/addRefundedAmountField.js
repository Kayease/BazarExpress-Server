const mongoose = require('mongoose');
require('dotenv').config();

// Import the Return model
const Return = require('../models/Return');

async function addRefundedAmountField() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.DB_URL || 'mongodb://localhost:27017/bazarxpress');
    console.log('Connected to MongoDB');

    // Update all return documents to add refundedAmount field with default value 0
    const result = await Return.updateMany(
      { refundedAmount: { $exists: false } },
      { $set: { refundedAmount: 0 } }
    );

    console.log(`Updated ${result.modifiedCount} return documents with refundedAmount field`);

    // For existing partially_refunded or refunded returns, try to extract amount from status history
    const refundedReturns = await Return.find({
      status: { $in: ['partially_refunded', 'refunded'] },
      refundedAmount: 0
    });

    console.log(`Found ${refundedReturns.length} refunded returns to process`);

    for (const returnDoc of refundedReturns) {
      let extractedAmount = 0;
      
      // Look for amount in status history notes
      for (const history of returnDoc.statusHistory) {
        if (history.status === 'partially_refunded' || history.status === 'refunded') {
          const amountMatch = history.note?.match(/Amount: ₹(\d+)/);
          if (amountMatch) {
            extractedAmount = parseInt(amountMatch[1]);
            break;
          }
        }
      }

      // If no amount found in notes, use refundInfo.totalRefundAmount if available
      if (extractedAmount === 0 && returnDoc.refundInfo?.totalRefundAmount) {
        extractedAmount = returnDoc.refundInfo.totalRefundAmount;
      }

      if (extractedAmount > 0) {
        await Return.updateOne(
          { _id: returnDoc._id },
          { $set: { refundedAmount: extractedAmount } }
        );
        console.log(`Updated return ${returnDoc.returnId} with refunded amount: ₹${extractedAmount}`);
      }
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the migration
addRefundedAmountField();
