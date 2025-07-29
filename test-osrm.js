/**
 * Simple OSRM Test Script for Server
 * Tests OSRM integration using public demo server
 */

const axios = require('axios');

const OSRM_BASE_URL = 'http://router.project-osrm.org';

// Test coordinates (Delhi area)
const testCoordinates = {
    warehouse: { lat: 28.6139, lng: 77.2090 }, // New Delhi
    customer: { lat: 28.5355, lng: 77.3910 }   // Noida
};

async function testOSRMPublicServer() {
    console.log('🔍 Testing OSRM Public Demo Server...');
    
    try {
        const url = `${OSRM_BASE_URL}/route/v1/driving/${testCoordinates.warehouse.lng},${testCoordinates.warehouse.lat};${testCoordinates.customer.lng},${testCoordinates.customer.lat}?overview=false`;
        
        console.log('Making request to:', url);
        
        const response = await axios.get(url, { 
            timeout: 15000,
            headers: {
                'User-Agent': 'BazarXpress-Test/1.0'
            }
        });
        
        if (response.data.code === 'Ok') {
            const route = response.data.routes[0];
            console.log('✅ OSRM Public Server: SUCCESS');
            console.log(`   Distance: ${(route.distance / 1000).toFixed(2)} km`);
            console.log(`   Duration: ${(route.duration / 60).toFixed(2)} minutes`);
            return true;
        } else {
            console.log('❌ OSRM Public Server: FAILED');
            console.log(`   Error: ${response.data.message}`);
            return false;
        }
    } catch (error) {
        console.log('❌ OSRM Public Server: FAILED');
        console.log(`   Error: ${error.message}`);
        return false;
    }
}

async function testOSRMService() {
    console.log('\n🔍 Testing OSRM Service Integration...');
    
    try {
        const osrmService = require('./utils/osrmService');
        
        const result = await osrmService.calculateRoute(
            testCoordinates.warehouse.lat,
            testCoordinates.warehouse.lng,
            testCoordinates.customer.lat,
            testCoordinates.customer.lng
        );
        
        console.log('✅ OSRM Service: SUCCESS');
        console.log(`   Distance: ${result.distance.toFixed(2)} km`);
        console.log(`   Duration: ${result.duration.toFixed(2)} minutes`);
        console.log(`   Fallback: ${result.route.fallback ? 'Yes' : 'No'}`);
        return true;
    } catch (error) {
        console.log('❌ OSRM Service: FAILED');
        console.log(`   Error: ${error.message}`);
        return false;
    }
}

async function runTests() {
    console.log('🚀 Starting OSRM Tests...');
    console.log('=====================================\n');
    
    const directTest = await testOSRMPublicServer();
    const serviceTest = await testOSRMService();
    
    console.log('\n📊 Test Results:');
    console.log('=====================================');
    console.log(`Direct OSRM: ${directTest ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`OSRM Service: ${serviceTest ? '✅ PASS' : '❌ FAIL'}`);
    
    if (directTest && serviceTest) {
        console.log('\n🎉 All tests passed! OSRM integration is working.');
        console.log('\nYour application now uses accurate distance calculations!');
    } else {
        console.log('\n⚠️  Some tests failed. Check your internet connection.');
    }
}

runTests().catch(error => {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
});