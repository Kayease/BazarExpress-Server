const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const MONGODB_URI = process.env.DB_URL;

async function createAdminUser() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Create admin user
        const adminUserData = {
            name: 'Admin User',
            email: 'admin@bazarxpress.com',
            phone: '9876543210',
            role: 'admin'
        };

        // Check if admin user already exists
        const existingAdmin = await User.findOne({ 
            $or: [
                { email: adminUserData.email },
                { phone: adminUserData.phone },
                { role: 'admin' }
            ]
        });

        if (!existingAdmin) {
            const adminUser = new User(adminUserData);
            await adminUser.save();
            console.log(`✅ Created admin user: ${adminUserData.name}`);
            console.log(`📧 Email: ${adminUserData.email}`);
            console.log(`📱 Phone: ${adminUserData.phone}`);
            console.log(`🔑 Role: ${adminUserData.role}`);
            console.log('\n💡 You can now log in using this phone number in the admin panel');
        } else {
            console.log(`ℹ️ Admin user already exists: ${existingAdmin.name}`);
            console.log(`📧 Email: ${existingAdmin.email}`);
            console.log(`📱 Phone: ${existingAdmin.phone}`);
            console.log(`🔑 Role: ${existingAdmin.role}`);
        }

        console.log('\nTest users creation completed');

    } catch (error) {
        console.error('Error creating admin user:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
createAdminUser();
