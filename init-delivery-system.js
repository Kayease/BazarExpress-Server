/**
 * Initialize Delivery System
 * Creates default warehouse and delivery settings for testing
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Warehouse = require('./models/Warehouse');
const DeliverySettings = require('./models/DeliverySettings');
const User = require('./models/User');

async function connectDB() {
    try {
        await mongoose.connect(process.env.DB_URL);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        process.exit(1);
    }
}

async function createDefaultUser() {
    try {
        let adminUser = await User.findOne({ email: 'admin@bazarxpress.com' });
        
        if (!adminUser) {
            adminUser = new User({
                name: 'Admin User',
                email: 'admin@bazarxpress.com',
                password: 'hashedpassword', // This should be properly hashed in real app
                role: 'admin',
                isVerified: true
            });
            await adminUser.save();
            console.log('✅ Created default admin user');
        } else {
            console.log('✅ Admin user already exists');
        }
        
        return adminUser;
    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
        throw error;
    }
}

async function createDefaultWarehouse(adminUserId) {
    try {
        const existingWarehouse = await Warehouse.findOne({ status: 'active' });
        
        if (!existingWarehouse) {
            const defaultWarehouse = new Warehouse({
                name: 'Main Warehouse - Delhi',
                address: 'Connaught Place, New Delhi, Delhi 110001, India',
                location: {
                    lat: 28.6139,
                    lng: 77.2090
                },
                contactPhone: '+91-9999999999',
                email: 'warehouse@bazarxpress.com',
                capacity: 10000,
                status: 'active',
                deliverySettings: {
                    maxDeliveryRadius: 50, // 50 km radius
                    freeDeliveryRadius: 5, // 5 km free delivery
                    isDeliveryEnabled: true,
                    deliveryDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
                    deliveryHours: {
                        start: '09:00',
                        end: '21:00'
                    }
                },
                userId: adminUserId
            });
            
            await defaultWarehouse.save();
            console.log('✅ Created default warehouse');
            console.log(`   Name: ${defaultWarehouse.name}`);
            console.log(`   Location: ${defaultWarehouse.location.lat}, ${defaultWarehouse.location.lng}`);
            console.log(`   Max Delivery Radius: ${defaultWarehouse.deliverySettings.maxDeliveryRadius} km`);
            
            return defaultWarehouse;
        } else {
            console.log('✅ Warehouse already exists');
            console.log(`   Name: ${existingWarehouse.name}`);
            console.log(`   Location: ${existingWarehouse.location.lat}, ${existingWarehouse.location.lng}`);
            return existingWarehouse;
        }
    } catch (error) {
        console.error('❌ Error creating warehouse:', error.message);
        throw error;
    }
}

async function createDefaultDeliverySettings(adminUserId) {
    try {
        const existingSettings = await DeliverySettings.findOne({ isActive: true });
        
        if (!existingSettings) {
            const defaultSettings = new DeliverySettings({
                freeDeliveryMinAmount: 500,
                freeDeliveryRadius: 5,
                baseDeliveryCharge: 30,
                minimumDeliveryCharge: 20,
                maximumDeliveryCharge: 150,
                perKmCharge: 8,
                codAvailable: true,
                calculationMethod: 'osrm',
                createdBy: adminUserId,
                updatedBy: adminUserId
            });
            
            await defaultSettings.save();
            console.log('✅ Created default delivery settings');
            console.log(`   Free delivery min amount: ₹${defaultSettings.freeDeliveryMinAmount}`);
            console.log(`   Free delivery radius: ${defaultSettings.freeDeliveryRadius} km`);
            console.log(`   Base delivery charge: ₹${defaultSettings.baseDeliveryCharge}`);
            console.log(`   Calculation method: ${defaultSettings.calculationMethod}`);
            
            return defaultSettings;
        } else {
            console.log('✅ Delivery settings already exist');
            console.log(`   Calculation method: ${existingSettings.calculationMethod}`);
            return existingSettings;
        }
    } catch (error) {
        console.error('❌ Error creating delivery settings:', error.message);
        throw error;
    }
}

async function testDeliveryCalculation() {
    console.log('\n🧪 Testing delivery calculation...');
    
    try {
        // Test coordinates (Noida - should be within delivery range)
        const testLat = 28.5355;
        const testLng = 77.3910;
        const testCartTotal = 600;
        
        // Find warehouse
        const warehouse = await Warehouse.findOne({ status: 'active' });
        if (!warehouse) {
            throw new Error('No active warehouse found');
        }
        
        // Calculate distance using OSRM
        const distanceResult = await DeliverySettings.calculateDistance(
            warehouse.location.lat,
            warehouse.location.lng,
            testLat,
            testLng,
            'osrm'
        );
        
        console.log(`   Test location: ${testLat}, ${testLng}`);
        console.log(`   Distance: ${distanceResult.distance.toFixed(2)} km`);
        console.log(`   Duration: ${distanceResult.duration.toFixed(2)} minutes`);
        console.log(`   Method: ${distanceResult.method}`);
        
        // Calculate delivery charge
        const deliveryInfo = await DeliverySettings.calculateDeliveryChargeWithWarehouse(
            distanceResult.distance,
            testCartTotal,
            'online',
            warehouse
        );
        
        console.log(`   Delivery charge: ₹${deliveryInfo.deliveryCharge}`);
        console.log(`   Free delivery: ${deliveryInfo.isFreeDelivery ? 'Yes' : 'No'}`);
        
        return true;
    } catch (error) {
        console.error('❌ Delivery calculation test failed:', error.message);
        return false;
    }
}

async function initializeDeliverySystem() {
    console.log('🚀 Initializing Delivery System...');
    console.log('=====================================\n');
    
    try {
        await connectDB();
        
        // Create default admin user
        const adminUser = await createDefaultUser();
        
        // Create default warehouse
        const warehouse = await createDefaultWarehouse(adminUser._id);
        
        // Create default delivery settings
        const settings = await createDefaultDeliverySettings(adminUser._id);
        
        // Test the system
        const testPassed = await testDeliveryCalculation();
        
        console.log('\n📊 Initialization Summary:');
        console.log('=====================================');
        console.log(`Admin User: ✅ Ready`);
        console.log(`Warehouse: ✅ Ready (${warehouse.name})`);
        console.log(`Delivery Settings: ✅ Ready (${settings.calculationMethod})`);
        console.log(`OSRM Integration: ${testPassed ? '✅ Working' : '❌ Failed'}`);
        
        if (testPassed) {
            console.log('\n🎉 Delivery system is ready!');
            console.log('\nYou can now:');
            console.log('1. Start your backend server: npm run dev');
            console.log('2. Test delivery calculation in your frontend');
            console.log('3. Use the payment page with accurate distance calculations');
        } else {
            console.log('\n⚠️  Delivery system initialized but OSRM test failed');
            console.log('Check your internet connection and OSRM configuration');
        }
        
    } catch (error) {
        console.error('\n💥 Initialization failed:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
    }
}

// Run initialization
initializeDeliverySystem();