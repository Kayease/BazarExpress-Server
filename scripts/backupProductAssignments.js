const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import models
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');

// MongoDB connection
const MONGODB_URI = process.env.DB_URL;

async function backupProductAssignments() {
    try {
        // Connect to MongoDB
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB successfully!');

        // Get all products with their warehouse assignments
        console.log('📦 Fetching product assignments...');
        const products = await Product.find({}, {
            _id: 1,
            name: 1,
            warehouse: 1,
            warehouseId: 1
        }).populate('warehouse', 'name');

        // Get all warehouses for reference
        const warehouses = await Warehouse.find({}, {
            _id: 1,
            name: 1
        });

        // Create backup data
        const backupData = {
            timestamp: new Date().toISOString(),
            totalProducts: products.length,
            totalWarehouses: warehouses.length,
            warehouses: warehouses,
            productAssignments: products.map(product => ({
                productId: product._id,
                productName: product.name,
                warehouseId: product.warehouse?._id || product.warehouseId,
                warehouseName: product.warehouse?.name || null
            }))
        };

        // Create backup filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFilename = `product-assignments-backup-${timestamp}.json`;
        const backupPath = path.join(__dirname, 'backups', backupFilename);

        // Create backups directory if it doesn't exist
        const backupsDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
        }

        // Write backup file
        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));

        console.log('✅ Backup created successfully!');
        console.log(`📁 Backup file: ${backupPath}`);
        console.log(`📊 Backed up ${products.length} product assignments`);

        // Show distribution summary
        const distributionSummary = {};
        let unassignedCount = 0;

        products.forEach(product => {
            if (product.warehouse) {
                const warehouseName = product.warehouse.name;
                distributionSummary[warehouseName] = (distributionSummary[warehouseName] || 0) + 1;
            } else {
                unassignedCount++;
            }
        });

        console.log('\n📊 Current distribution:');
        Object.entries(distributionSummary).forEach(([warehouseName, count]) => {
            console.log(`   ${warehouseName}: ${count} products`);
        });
        
        if (unassignedCount > 0) {
            console.log(`   Unassigned: ${unassignedCount} products`);
        }

        return backupPath;

    } catch (error) {
        console.error('❌ Error creating backup:', error);
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

async function restoreProductAssignments(backupFilePath) {
    try {
        // Check if backup file exists
        if (!fs.existsSync(backupFilePath)) {
            throw new Error(`Backup file not found: ${backupFilePath}`);
        }

        // Read backup file
        console.log('📖 Reading backup file...');
        const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));

        console.log(`📊 Backup info:`);
        console.log(`   Created: ${backupData.timestamp}`);
        console.log(`   Products: ${backupData.totalProducts}`);
        console.log(`   Warehouses: ${backupData.totalWarehouses}`);

        // Connect to MongoDB
        console.log('\n🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB successfully!');

        // Restore assignments
        console.log('🔄 Restoring product assignments...');
        const updatePromises = [];

        for (const assignment of backupData.productAssignments) {
            const updateData = {};
            
            if (assignment.warehouseId) {
                updateData.warehouse = assignment.warehouseId;
                updateData.warehouseId = assignment.warehouseId;
            } else {
                updateData.$unset = { warehouse: 1, warehouseId: 1 };
            }

            const updatePromise = Product.findByIdAndUpdate(
                assignment.productId,
                updateData,
                { new: false }
            );

            updatePromises.push(updatePromise);
        }

        await Promise.all(updatePromises);

        console.log('✅ Restore completed successfully!');
        console.log(`📊 Restored ${backupData.productAssignments.length} product assignments`);

    } catch (error) {
        console.error('❌ Error restoring backup:', error);
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'backup') {
        await backupProductAssignments();
    } else if (command === 'restore') {
        const backupFile = args[1];
        if (!backupFile) {
            console.log('❌ Please provide backup file path');
            console.log('Usage: node backupProductAssignments.js restore <backup-file-path>');
            return;
        }
        await restoreProductAssignments(backupFile);
    } else {
        console.log(`
🔄 Product Assignment Backup & Restore Tool

Usage:
  node backupProductAssignments.js backup
  node backupProductAssignments.js restore <backup-file-path>

Commands:
  backup   - Create a backup of current product-warehouse assignments
  restore  - Restore product assignments from a backup file

Examples:
  # Create backup
  node backupProductAssignments.js backup

  # Restore from backup
  node backupProductAssignments.js restore ./backups/product-assignments-backup-2024-01-15T10-30-00-000Z.json
`);
    }
}

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    });
}

module.exports = {
    backupProductAssignments,
    restoreProductAssignments
};