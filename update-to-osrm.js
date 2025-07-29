/**
 * Update delivery settings to use OSRM
 */

require('dotenv').config();
const mongoose = require('mongoose');
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

async function updateToOSRM() {
    try {
        const settings = await DeliverySettings.findOne({ isActive: true });
        
        if (settings) {
            settings.calculationMethod = 'osrm';
            await settings.save();
            
            console.log('✅ Updated delivery settings to use OSRM');
            console.log(`   Calculation method: ${settings.calculationMethod}`);
        } else {
            console.log('❌ No active delivery settings found');
        }
        
    } catch (error) {
        console.error('❌ Error updating settings:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('✅ Database connection closed');
    }
}

connectDB().then(updateToOSRM);