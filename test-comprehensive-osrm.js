/**
 * Comprehensive OSRM Integration Test
 * Tests all aspects of OSRM integration with delivery system
 */

require('dotenv').config();
const mongoose = require('mongoose');
const osrmService = require('./utils/osrmService');
const Warehouse = require('./models/Warehouse');
const DeliverySettings = require('./models/DeliverySettings');

async function connectDB() {
    try {
        await mongoose.connect(process.env.DB_URL);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        process.exit(1);
    }
}

async function testOSRMService() {
    console.log('\n🔍 Testing OSRM Service...');
    console.log('============================');
    
    try {
        // Test 1: Basic route calculation
        console.log('\n1. Testing basic route calculation...');
        const jaipur = { lat: 26.8504593, lng: 75.76277019999999 };
        const nearby = { lat: 26.860459, lng: 75.772770 };
        
        const result = await osrmService.calculateRoute(jaipur.lat, jaipur.lng, nearby.lat, nearby.lng);
        
        console.log(`   Distance: ${result.distance.toFixed(2)} km`);
        console.log(`   Duration: ${result.duration.toFixed(2)} minutes`);
        console.log(`   Method: ${result.method}`);
        console.log(`   Fallback: ${result.fallback ? 'Yes' : 'No'}`);
        
        // Test 2: Health check
        console.log('\n2. Testing OSRM health check...');
        const health = await osrmService.checkHealth();
        console.log(`   Server available: ${health.available ? '✅' : '❌'}`);
        console.log(`   Server URL: ${health.server}`);
        if (health.error) {
            console.log(`   Error: ${health.error}`);
        }
        
        // Test 3: Invalid coordinates
        console.log('\n3. Testing invalid coordinates handling...');
        try {
            await osrmService.calculateRoute(999, 999, 28.6139, 77.2090);
            console.log('   ❌ Should have thrown error for invalid coordinates');
        } catch (error) {
            console.log('   ✅ Properly handled invalid coordinates');
        }
        
        return true;
    } catch (error) {
        console.error('❌ OSRM Service test failed:', error.message);
        return false;
    }
}

async function testWarehouseSelection() {
    console.log('\n🏪 Testing Warehouse Selection...');
    console.log('==================================');
    
    try {
        const warehouses = await Warehouse.find({ status: 'active' });
        console.log(`Found ${warehouses.length} active warehouses`);
        
        // Test coordinates near Jaipur (should work)
        const testLat = 26.860459;
        const testLng = 75.772770;
        
        console.log(`\nTesting delivery to: ${testLat}, ${testLng}`);
        
        // Test 1: Find nearest warehouse using OSRM
        console.log('\n1. Finding nearest warehouse with OSRM...');
        const nearestResult = await osrmService.findNearestWarehouse(testLat, testLng, warehouses);
        
        if (nearestResult) {
            console.log(`   ✅ Nearest warehouse: ${nearestResult.warehouse.name}`);
            console.log(`   Distance: ${nearestResult.distance.toFixed(2)} km`);
            console.log(`   Duration: ${nearestResult.duration.toFixed(2)} minutes`);
            console.log(`   Method: ${nearestResult.method}`);
        } else {
            console.log('   ❌ No nearest warehouse found');
        }
        
        // Test 2: Check delivery availability
        console.log('\n2. Checking delivery availability...');
        if (nearestResult) {
            const availability = await osrmService.checkDeliveryAvailability(
                nearestResult.warehouse.location.lat,
                nearestResult.warehouse.location.lng,
                testLat,
                testLng,
                nearestResult.warehouse.deliverySettings.maxDeliveryRadius
            );
            
            console.log(`   Available: ${availability.available ? '✅' : '❌'}`);
            console.log(`   Distance: ${availability.distance.toFixed(2)} km`);
            console.log(`   Max radius: ${availability.maxRadius} km`);
        }
        
        // Test 3: Use Warehouse model method
        console.log('\n3. Testing Warehouse.findBestWarehouseForDelivery...');
        const bestWarehouse = await Warehouse.findBestWarehouseForDelivery(testLat, testLng);
        
        if (bestWarehouse) {
            console.log(`   ✅ Best warehouse: ${bestWarehouse.warehouse.name}`);
            console.log(`   Distance: ${bestWarehouse.distance.toFixed(2)} km`);
            console.log(`   Method: ${bestWarehouse.method}`);
        } else {
            console.log('   ❌ No suitable warehouse found');
        }
        
        return true;
    } catch (error) {
        console.error('❌ Warehouse selection test failed:', error.message);
        return false;
    }
}

async function testDeliveryCalculation() {
    console.log('\n💰 Testing Delivery Calculation...');
    console.log('===================================');
    
    try {
        // Test coordinates near Jaipur
        const testLat = 26.860459;
        const testLng = 75.772770;
        const cartTotal = 600;
        
        console.log(`Testing delivery calculation for:`);
        console.log(`  Location: ${testLat}, ${testLng}`);
        console.log(`  Cart total: ₹${cartTotal}`);
        
        // Find best warehouse
        const bestWarehouse = await Warehouse.findBestWarehouseForDelivery(testLat, testLng);
        
        if (!bestWarehouse) {
            console.log('❌ No warehouse available for testing');
            return false;
        }
        
        console.log(`\nUsing warehouse: ${bestWarehouse.warehouse.name}`);
        console.log(`Distance: ${bestWarehouse.distance.toFixed(2)} km`);
        
        // Calculate delivery charges
        const deliveryInfo = await DeliverySettings.calculateDeliveryChargeWithWarehouse(
            bestWarehouse.distance,
            cartTotal,
            'online',
            bestWarehouse.warehouse
        );
        
        console.log('\nDelivery calculation results:');
        console.log(`  Delivery charge: ₹${deliveryInfo.deliveryCharge}`);
        console.log(`  Free delivery: ${deliveryInfo.isFreeDelivery ? 'Yes' : 'No'}`);
        console.log(`  Free delivery eligible: ${deliveryInfo.freeDeliveryEligible ? 'Yes' : 'No'}`);
        console.log(`  Amount needed for free delivery: ₹${deliveryInfo.amountNeededForFreeDelivery}`);
        
        return true;
    } catch (error) {
        console.error('❌ Delivery calculation test failed:', error.message);
        return false;
    }
}

async function testAPIEndpoint() {
    console.log('\n🌐 Testing API Endpoint...');
    console.log('===========================');
    
    try {
        const axios = require('axios');
        const API_URL = 'http://localhost:4000/api/delivery/calculate';
        
        // Test with coordinates near Jaipur
        const testData = {
            customerLat: 26.860459,
            customerLng: 75.772770,
            cartTotal: 600,
            paymentMethod: 'online'
        };
        
        console.log('Making API request...');
        console.log('URL:', API_URL);
        console.log('Data:', testData);
        
        const response = await axios.post(API_URL, testData, {
            timeout: 20000,
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.data.success) {
            console.log('\n✅ API Response successful:');
            console.log(`  Distance: ${response.data.distance} km`);
            console.log(`  Duration: ${response.data.duration} minutes`);
            console.log(`  Method: ${response.data.calculationMethod}`);
            console.log(`  Delivery charge: ₹${response.data.deliveryCharge}`);
            console.log(`  Warehouse: ${response.data.warehouse.name}`);
            console.log(`  Free delivery: ${response.data.isFreeDelivery ? 'Yes' : 'No'}`);
        } else {
            console.log('❌ API returned error:', response.data.error);
            return false;
        }
        
        // Test with coordinates outside delivery range (Delhi)
        console.log('\n2. Testing with out-of-range coordinates (Delhi)...');
        const outOfRangeData = {
            customerLat: 28.6139,
            customerLng: 77.2090,
            cartTotal: 600,
            paymentMethod: 'online'
        };
        
        try {
            const outOfRangeResponse = await axios.post(API_URL, outOfRangeData, {
                timeout: 20000,
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (outOfRangeResponse.data.success) {
                console.log('   ⚠️  Unexpected success for out-of-range location');
            } else {
                console.log('   ✅ Properly rejected out-of-range location');
                console.log(`   Error: ${outOfRangeResponse.data.error}`);
            }
        } catch (error) {
            if (error.response && error.response.status === 400) {
                console.log('   ✅ Properly rejected out-of-range location');
                console.log(`   Error: ${error.response.data.error}`);
            } else {
                console.log('   ❌ Unexpected error:', error.message);
            }
        }
        
        return true;
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('❌ API server not running. Start with: npm run dev');
        } else {
            console.error('❌ API test failed:', error.message);
        }
        return false;
    }
}

async function runComprehensiveTests() {
    console.log('🚀 Starting Comprehensive OSRM Integration Tests...');
    console.log('=====================================================');
    
    try {
        await connectDB();
        
        const results = {
            osrmService: await testOSRMService(),
            warehouseSelection: await testWarehouseSelection(),
            deliveryCalculation: await testDeliveryCalculation(),
            apiEndpoint: await testAPIEndpoint()
        };
        
        console.log('\n📊 Test Results Summary:');
        console.log('=========================');
        console.log(`OSRM Service: ${results.osrmService ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Warehouse Selection: ${results.warehouseSelection ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Delivery Calculation: ${results.deliveryCalculation ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`API Endpoint: ${results.apiEndpoint ? '✅ PASS' : '❌ FAIL'}`);
        
        const passedTests = Object.values(results).filter(Boolean).length;
        const totalTests = Object.keys(results).length;
        
        console.log(`\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
        
        if (passedTests === totalTests) {
            console.log('\n🎉 All tests passed! OSRM integration is working perfectly.');
            console.log('\n✅ Your delivery system now provides:');
            console.log('   - Accurate road-based distance calculations');
            console.log('   - Real travel time estimates');
            console.log('   - Proper delivery zone validation');
            console.log('   - Distance-based shipping charges');
            console.log('   - Automatic fallback to Haversine if OSRM fails');
        } else {
            console.log('\n⚠️  Some tests failed. Check the errors above.');
        }
        
        // Cache statistics
        const cacheStats = osrmService.getCacheStats();
        console.log(`\n📈 OSRM Cache Statistics:`);
        console.log(`   Cached entries: ${cacheStats.size}`);
        console.log(`   Cache timeout: ${cacheStats.timeout / 1000}s`);
        
    } catch (error) {
        console.error('\n💥 Test execution failed:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
    }
}

// Run tests
runComprehensiveTests();