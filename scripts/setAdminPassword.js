const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || process.env.DB_URL;

async function setSpecificAdminPassword() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB successfully');
    
    // Get admin identifier from command line arguments
    const adminIdentifier = process.argv[2];
    
    if (!adminIdentifier) {
      console.log('\n❌ Please provide admin identifier (email, phone, or name)');
      console.log('Usage: npm run set-admin-password <email|phone|name>');
      console.log('Example: npm run set-admin-password admin@example.com');
      console.log('Example: npm run set-admin-password +1234567890');
      console.log('Example: npm run set-admin-password "Admin User"');
      return;
    }

    console.log(`\n🔍 Searching for admin user: "${adminIdentifier}"`);

    // Find the specific admin user by email, phone, or name
    const adminUser = await User.findOne({
      role: 'admin',
      $or: [
        { email: { $regex: new RegExp('^' + adminIdentifier + '$', 'i') } },
        { phone: adminIdentifier },
        { name: { $regex: new RegExp('^' + adminIdentifier + '$', 'i') } }
      ]
    });

    if (!adminUser) {
      console.log('❌ Admin user not found!');
      console.log('\n📋 Available admin users:');
      
      // Show all admin users for reference
      const allAdmins = await User.find({ role: 'admin' }).select('name email phone');
      if (allAdmins.length === 0) {
        console.log('No admin users found in the database.');
      } else {
        allAdmins.forEach((admin, index) => {
          const userInfo = [
            admin.name && `Name: "${admin.name}"`,
            admin.email && `Email: "${admin.email}"`,
            admin.phone && `Phone: "${admin.phone}"`
          ].filter(Boolean).join(', ');
          console.log(`${index + 1}. ${userInfo || `ID: ${admin._id}`}`);
        });
      }
      return;
    }

    // Get new password from command line or use default
    const newPassword = process.argv[3] || 'admin@123';
    
    // Update the user's password
    adminUser.password = newPassword;
    await adminUser.save();
    
    const userInfo = [
      adminUser.name && `Name: "${adminUser.name}"`,
      adminUser.email && `Email: "${adminUser.email}"`,
      adminUser.phone && `Phone: "${adminUser.phone}"`
    ].filter(Boolean).join(', ');
    
    console.log('\n✅ SUCCESS!');
    console.log(`Password reset for admin user: ${userInfo}`);
    console.log(`New password: "${newPassword}"`);
    
    console.log('\n🔐 IMPORTANT SECURITY NOTICE:');
    console.log('Please ensure the admin changes this password after first login!');
    console.log('Login at: /admin with the updated credentials');
    
  } catch (error) {
    console.error('❌ Error resetting admin password:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔚 Database connection closed');
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n⏹️ Process interrupted. Closing database connection...');
  try {
    await mongoose.connection.close();
  } catch (err) {
    console.error('Error closing connection:', err.message);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️ Process terminated. Closing database connection...');
  try {
    await mongoose.connection.close();
  } catch (err) {
    console.error('Error closing connection:', err.message);
  }
  process.exit(0);
});

// Run the script
console.log('🚀 Admin Password Reset Script');
console.log('===============================');
setSpecificAdminPassword();