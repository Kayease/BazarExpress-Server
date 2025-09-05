const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const Order = require('../models/Order');

const MONGODB_URI = process.env.DB_URL || process.env.MONGODB_URI || process.env.MONGO_URI;

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

async function run() {
  if (!MONGODB_URI) {
    console.error('Missing DB connection string');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  try {
    const orders = await Order.find().sort({ createdAt: 1 }).lean();
    console.log(`Found ${orders.length} orders\n`);

    let seq = 0;
    let totalUpdated = 0;

    for (const o of orders) {
      seq++;
      const created = new Date(o.createdAt);
      const dateKey = formatDate(created);
      const invoiceNumber = `INV-${dateKey}-${String(seq).padStart(2, '0')}`;

      await Order.updateOne(
        { _id: o._id },
        { $set: { invoiceNumber } }
      );

      totalUpdated++;
      if (totalUpdated % 50 === 0) {
        console.log(`Updated ${totalUpdated} orders so far...`);
      }
    }

    console.log(`\n✅ Update complete. Updated ${totalUpdated} orders in DB.`);
  } catch (err) {
    console.error('Error updating invoices:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

run();
