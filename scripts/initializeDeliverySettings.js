const mongoose = require('mongoose');
const DeliverySettings = require('../models/DeliverySettings');

// Load environment variables
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URL || 'mongodb://localhost:27017/bazarexpress');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Initialize delivery settings for both warehouse types
const initializeDeliverySettings = async () => {
  try {
    console.log('Initializing delivery settings...');

    // Get or create a system user for initialization
    const User = require('../models/User');
    let systemUser = await User.findOne({ email: 'system@bazarexpress.com' });
    
    if (!systemUser) {
      systemUser = new User({
        name: 'System',
        email: 'system@bazarexpress.com',
        password: 'system123', // This will be hashed by the model
        role: 'admin',
        isVerified: true
      });
      await systemUser.save();
      console.log('✅ System user created');
    }

    // Check if settings already exist
    const existingCustomSettings = await DeliverySettings.findOne({ 
      warehouseType: 'custom', 
      isActive: true 
    });
    
    const existingGlobalSettings = await DeliverySettings.findOne({ 
      warehouseType: 'global', 
      isActive: true 
    });

    // Create custom warehouse settings if they don't exist
    if (!existingCustomSettings) {
      const customSettings = new DeliverySettings({
        warehouseType: 'custom',
        freeDeliveryMinAmount: 500,
        freeDeliveryRadius: 3,
        baseDeliveryCharge: 20,
        minimumDeliveryCharge: 10,
        maximumDeliveryCharge: 100,
        perKmCharge: 5,
        isActive: true,
        createdBy: systemUser._id,
        updatedBy: systemUser._id
      });

      await customSettings.save();
      console.log('✅ Custom warehouse delivery settings created');
    } else {
      console.log('ℹ️  Custom warehouse delivery settings already exist');
    }

    // Create global warehouse settings if they don't exist
    if (!existingGlobalSettings) {
      const globalSettings = new DeliverySettings({
        warehouseType: 'global',
        freeDeliveryMinAmount: 1000, // Higher threshold for global warehouses
        freeDeliveryRadius: 5, // Larger radius for global warehouses
        baseDeliveryCharge: 30, // Higher base charge for global warehouses
        minimumDeliveryCharge: 15,
        maximumDeliveryCharge: 150,
        perKmCharge: 7, // Higher per km charge for global warehouses
        isActive: true,
        createdBy: systemUser._id,
        updatedBy: systemUser._id
      });

      await globalSettings.save();
      console.log('✅ Global warehouse delivery settings created');
    } else {
      console.log('ℹ️  Global warehouse delivery settings already exist');
    }

    console.log('🎉 Delivery settings initialization completed!');
    
    // Display current settings
    const customSettings = await DeliverySettings.findOne({ 
      warehouseType: 'custom', 
      isActive: true 
    });
    
    const globalSettings = await DeliverySettings.findOne({ 
      warehouseType: 'global', 
      isActive: true 
    });

    console.log('\n📋 Current Settings Summary:');
    console.log('Custom Warehouse Settings:', {
      freeDeliveryMinAmount: customSettings?.freeDeliveryMinAmount,
      freeDeliveryRadius: customSettings?.freeDeliveryRadius,
      baseDeliveryCharge: customSettings?.baseDeliveryCharge,
      perKmCharge: customSettings?.perKmCharge
    });
    
    console.log('Global Warehouse Settings:', {
      freeDeliveryMinAmount: globalSettings?.freeDeliveryMinAmount,
      freeDeliveryRadius: globalSettings?.freeDeliveryRadius,
      baseDeliveryCharge: globalSettings?.baseDeliveryCharge,
      perKmCharge: globalSettings?.perKmCharge
    });

  } catch (error) {
    console.error('❌ Error initializing delivery settings:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
};

// Run the script
const main = async () => {
  await connectDB();
  await initializeDeliverySettings();
};

main().catch(console.error);