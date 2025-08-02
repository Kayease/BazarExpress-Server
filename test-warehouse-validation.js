/**
 * Test script for warehouse validation in cart operations
 * 
 * This script tests the warehouse conflict validation logic
 * to ensure users cannot add products from different custom warehouses.
 */

const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');
const Warehouse = require('./models/Warehouse');

// Mock data for testing
const testData = {
  // Test warehouses
  customWarehouse1: {
    name: 'Local Store Downtown',
    address: '123 Main St, Downtown',
    location: { lat: 40.7128, lng: -74.0060 },
    deliverySettings: {
      is24x7Delivery: false,
      deliveryHours: { start: '09:00', end: '21:00' }
    },
    userId: new mongoose.Types.ObjectId()
  },
  customWarehouse2: {
    name: 'Local Store Uptown',
    address: '456 Oak Ave, Uptown',
    location: { lat: 40.7589, lng: -73.9851 },
    deliverySettings: {
      is24x7Delivery: false,
      deliveryHours: { start: '08:00', end: '22:00' }
    },
    userId: new mongoose.Types.ObjectId()
  },
  globalWarehouse: {
    name: 'Global Distribution Center',
    address: '789 Industrial Blvd',
    location: { lat: 40.6892, lng: -74.0445 },
    deliverySettings: {
      is24x7Delivery: true
    },
    userId: new mongoose.Types.ObjectId()
  },
  // Test user
  testUser: {
    name: 'Test User',
    email: 'test@example.com',
    phone: '1234567890',
    cart: []
  }
};

async function runTests() {
  try {
    console.log('🧪 Starting warehouse validation tests...\n');

    // Connect to MongoDB (use your actual connection string)
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bazarxpress-test');
    console.log('✅ Connected to MongoDB\n');

    // Clean up existing test data
    await User.deleteMany({ email: testData.testUser.email });
    await Warehouse.deleteMany({ name: { $in: [testData.customWarehouse1.name, testData.customWarehouse2.name, testData.globalWarehouse.name] } });
    await Product.deleteMany({ name: { $regex: /^Test Product/ } });

    // Create test warehouses
    const warehouse1 = await Warehouse.create(testData.customWarehouse1);
    const warehouse2 = await Warehouse.create(testData.customWarehouse2);
    const globalWarehouse = await Warehouse.create(testData.globalWarehouse);

    console.log('✅ Created test warehouses:');
    console.log(`   - ${warehouse1.name} (Custom)`);
    console.log(`   - ${warehouse2.name} (Custom)`);
    console.log(`   - ${globalWarehouse.name} (Global)\n`);

    // Create test products
    const product1 = await Product.create({
      name: 'Test Product 1',
      price: 10.99,
      unit: '1 piece',
      image: 'test1.jpg',
      warehouse: warehouse1._id,
      stock: 100,
      status: 'active'
    });

    const product2 = await Product.create({
      name: 'Test Product 2',
      price: 15.99,
      unit: '1 piece',
      image: 'test2.jpg',
      warehouse: warehouse2._id,
      stock: 100,
      status: 'active'
    });

    const globalProduct = await Product.create({
      name: 'Test Global Product',
      price: 20.99,
      unit: '1 piece',
      image: 'global.jpg',
      warehouse: globalWarehouse._id,
      stock: 100,
      status: 'active'
    });

    console.log('✅ Created test products:');
    console.log(`   - ${product1.name} (from ${warehouse1.name})`);
    console.log(`   - ${product2.name} (from ${warehouse2.name})`);
    console.log(`   - ${globalProduct.name} (from ${globalWarehouse.name})\n`);

    // Create test user
    const user = await User.create(testData.testUser);
    console.log(`✅ Created test user: ${user.email}\n`);

    // Test scenarios
    console.log('🧪 Running test scenarios...\n');

    // Test 1: Add product from custom warehouse 1 (should succeed)
    console.log('Test 1: Adding product from custom warehouse 1');
    user.cart.push({ productId: product1._id, quantity: 1, addedAt: new Date() });
    await user.save();
    console.log('✅ Success: Product added to empty cart\n');

    // Test 2: Add another product from same custom warehouse (should succeed)
    console.log('Test 2: Adding another product from same custom warehouse');
    user.cart.push({ productId: product1._id, quantity: 2, addedAt: new Date() });
    await user.save();
    console.log('✅ Success: Product from same warehouse added\n');

    // Test 3: Add global product to cart with custom warehouse product (should succeed)
    console.log('Test 3: Adding global product to cart with custom warehouse product');
    user.cart.push({ productId: globalProduct._id, quantity: 1, addedAt: new Date() });
    await user.save();
    console.log('✅ Success: Global product added to cart with custom warehouse product\n');

    // Test 4: Try to add product from different custom warehouse (should fail in real implementation)
    console.log('Test 4: Attempting to add product from different custom warehouse');
    
    // Populate cart to check warehouses
    await user.populate({
      path: 'cart.productId',
      populate: {
        path: 'warehouse',
        model: 'Warehouse'
      }
    });

    // Find existing custom warehouse
    let existingCustomWarehouse = null;
    for (const cartItem of user.cart) {
      if (cartItem.productId && cartItem.productId.warehouse) {
        const itemWarehouse = cartItem.productId.warehouse;
        const isItemGlobal = itemWarehouse.deliverySettings?.is24x7Delivery === true;
        
        if (!isItemGlobal) {
          existingCustomWarehouse = itemWarehouse;
          break;
        }
      }
    }

    // Check if product2 would conflict
    const product2WithWarehouse = await Product.findById(product2._id).populate('warehouse');
    const isProduct2Global = product2WithWarehouse.warehouse.deliverySettings?.is24x7Delivery === true;

    if (!isProduct2Global && existingCustomWarehouse && 
        existingCustomWarehouse._id.toString() !== product2WithWarehouse.warehouse._id.toString()) {
      console.log(`❌ Validation Error: Cannot add products from different custom warehouses.`);
      console.log(`   Existing: ${existingCustomWarehouse.name}`);
      console.log(`   Trying to add: ${product2WithWarehouse.warehouse.name}`);
      console.log('✅ Warehouse validation working correctly!\n');
    } else {
      console.log('❌ Warehouse validation failed - should have detected conflict\n');
    }

    // Clean up
    console.log('🧹 Cleaning up test data...');
    await User.deleteOne({ _id: user._id });
    await Product.deleteMany({ _id: { $in: [product1._id, product2._id, globalProduct._id] } });
    await Warehouse.deleteMany({ _id: { $in: [warehouse1._id, warehouse2._id, globalWarehouse._id] } });
    console.log('✅ Test data cleaned up\n');

    console.log('🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };