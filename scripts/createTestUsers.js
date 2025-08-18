const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const MONGODB_URI = process.env.DB_URL;

async function createTestUsers() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Create test users
        const testUsers = [
            {
                name: 'John Doe',
                email: 'john.doe@example.com',
                phone: '+91 9876543210',
                role: 'user'
            },
            {
                name: 'Jane Smith',
                email: 'jane.smith@example.com',
                phone: '+91 8765432109',
                role: 'user'
            },
            {
                name: 'Bob Johnson',
                email: 'bob.johnson@example.com',
                phone: '+91 7654321098',
                role: 'user'
            }
        ];

        for (const userData of testUsers) {
            // Check if user already exists
            const existingUser = await User.findOne({ 
                $or: [
                    { email: userData.email },
                    { phone: userData.phone }
                ]
            });

            if (!existingUser) {
                const user = new User(userData);
                await user.save();
                console.log(`Created user: ${userData.name} (${userData.email})`);
            } else {
                console.log(`User already exists: ${userData.name}`);
            }
        }

        console.log('Test users creation completed');

    } catch (error) {
        console.error('Error creating test users:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the script
createTestUsers();