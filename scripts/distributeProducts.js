const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import models
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');

// MongoDB connection
const MONGODB_URI = process.env.DB_URL;

async function distributeProductsEvenly(options = {}) {
    try {
        // Connect to MongoDB
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB successfully!');

        // Get all warehouses (optionally filter by specific warehouses)
        console.log('🏪 Fetching warehouses...');
        let warehouseQuery = {};
        if (options.warehouseIds && options.warehouseIds.length > 0) {
            warehouseQuery._id = { $in: options.warehouseIds };
        }
        
        const warehouses = await Warehouse.find(warehouseQuery);
        
        if (warehouses.length === 0) {
            console.log('❌ No warehouses found in the database!');
            return;
        }

        console.log(`📦 Found ${warehouses.length} warehouses:`);
        warehouses.forEach((warehouse, index) => {
            console.log(`   ${index + 1}. ${warehouse.name} (ID: ${warehouse._id})`);
        });

        // Get products (optionally filter by category or other criteria)
        console.log('\n🛍️ Fetching products...');
        let productQuery = {};
        
        if (options.categoryId) {
            productQuery.category = options.categoryId;
        }
        
        if (options.status) {
            productQuery.status = options.status;
        } else {
            // Default to active products only
            productQuery.status = 'active';
        }

        // Option to redistribute only unassigned products
        if (options.unassignedOnly) {
            productQuery.$or = [
                { warehouse: { $exists: false } },
                { warehouse: null },
                { warehouseId: { $exists: false } },
                { warehouseId: null }
            ];
        }

        const products = await Product.find(productQuery);
        
        if (products.length === 0) {
            console.log('❌ No products found matching the criteria!');
            return;
        }

        console.log(`📊 Found ${products.length} products to distribute`);

        // Show current distribution before changes
        if (!options.unassignedOnly) {
            console.log('\n📊 Current distribution:');
            for (const warehouse of warehouses) {
                const currentCount = await Product.countDocuments({ 
                    warehouse: warehouse._id 
                });
                console.log(`   ${warehouse.name}: ${currentCount} products`);
            }
        }

        // Calculate distribution
        const productsPerWarehouse = Math.floor(products.length / warehouses.length);
        const remainingProducts = products.length % warehouses.length;

        console.log(`\n📈 Distribution plan:`);
        console.log(`   Products per warehouse: ${productsPerWarehouse}`);
        console.log(`   Remaining products: ${remainingProducts}`);
        console.log(`   (Remaining products will be distributed to first ${remainingProducts} warehouses)`);

        // Confirm before proceeding (unless --force is used)
        if (!options.force) {
            console.log('\n⚠️  This will update product warehouse assignments!');
            console.log('Use --force flag to skip this confirmation.');
            return;
        }

        // Shuffle products for random distribution (optional)
        if (options.shuffle) {
            console.log('🔀 Shuffling products for random distribution...');
            for (let i = products.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [products[i], products[j]] = [products[j], products[i]];
            }
        }

        // Distribute products
        console.log('\n🔄 Starting product distribution...');
        
        let productIndex = 0;
        const updatePromises = [];
        const batchSize = 100; // Process in batches to avoid memory issues

        for (let warehouseIndex = 0; warehouseIndex < warehouses.length; warehouseIndex++) {
            const warehouse = warehouses[warehouseIndex];
            
            // Calculate how many products this warehouse should get
            let productsForThisWarehouse = productsPerWarehouse;
            if (warehouseIndex < remainingProducts) {
                productsForThisWarehouse += 1; // Give one extra product to first few warehouses
            }

            console.log(`\n🏪 Assigning ${productsForThisWarehouse} products to "${warehouse.name}"`);

            // Assign products to this warehouse
            for (let i = 0; i < productsForThisWarehouse && productIndex < products.length; i++) {
                const product = products[productIndex];
                
                // Update both warehouse and warehouseId fields
                const updatePromise = Product.findByIdAndUpdate(
                    product._id,
                    {
                        warehouse: warehouse._id,
                        warehouseId: warehouse._id
                    },
                    { new: false } // Don't return the updated document to save memory
                );
                
                updatePromises.push(updatePromise);
                productIndex++;

                // Process in batches to avoid memory issues
                if (updatePromises.length >= batchSize) {
                    await Promise.all(updatePromises);
                    updatePromises.length = 0; // Clear the array
                    console.log(`   📦 Processed batch of ${batchSize} products...`);
                }
            }

            console.log(`   ✅ Queued ${productsForThisWarehouse} products for "${warehouse.name}"`);
        }

        // Execute remaining updates
        if (updatePromises.length > 0) {
            console.log('\n💾 Executing final batch of database updates...');
            await Promise.all(updatePromises);
        }

        // Verify distribution
        console.log('\n📊 Verifying final distribution...');
        let totalVerified = 0;
        for (const warehouse of warehouses) {
            const productCount = await Product.countDocuments({ 
                warehouse: warehouse._id 
            });
            console.log(`   ${warehouse.name}: ${productCount} products`);
            totalVerified += productCount;
        }

        // Summary
        console.log('\n🎉 Distribution completed successfully!');
        console.log(`📈 Summary:`);
        console.log(`   Total products processed: ${products.length}`);
        console.log(`   Total products verified: ${totalVerified}`);
        console.log(`   Warehouses used: ${warehouses.length}`);

        if (totalVerified !== products.length) {
            console.log(`⚠️  Warning: Verification mismatch! Expected ${products.length}, found ${totalVerified}`);
        }

        return {
            success: true,
            productsProcessed: products.length,
            warehousesUsed: warehouses.length,
            distribution: await getDistributionSummary(warehouses)
        };

    } catch (error) {
        console.error('❌ Error during product distribution:', error);
        return {
            success: false,
            error: error.message
        };
    } finally {
        // Close MongoDB connection
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

async function getDistributionSummary(warehouses) {
    const summary = {};
    for (const warehouse of warehouses) {
        const count = await Product.countDocuments({ warehouse: warehouse._id });
        summary[warehouse.name] = count;
    }
    return summary;
}

// Show current distribution without making changes
async function showCurrentDistribution() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB successfully!');

        const warehouses = await Warehouse.find({});
        const totalProducts = await Product.countDocuments({});
        
        console.log(`\n📊 Current Product Distribution:`);
        console.log(`Total products in database: ${totalProducts}`);
        console.log(`Total warehouses: ${warehouses.length}\n`);

        let assignedProducts = 0;
        for (const warehouse of warehouses) {
            const productCount = await Product.countDocuments({ 
                warehouse: warehouse._id 
            });
            console.log(`   ${warehouse.name}: ${productCount} products`);
            assignedProducts += productCount;
        }

        const unassignedProducts = await Product.countDocuments({
            $or: [
                { warehouse: { $exists: false } },
                { warehouse: null },
                { warehouseId: { $exists: false } },
                { warehouseId: null }
            ]
        });

        console.log(`\n📈 Summary:`);
        console.log(`   Assigned products: ${assignedProducts}`);
        console.log(`   Unassigned products: ${unassignedProducts}`);
        console.log(`   Total: ${assignedProducts + unassignedProducts}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
    }
}

// Command line argument parsing
function parseArguments() {
    const args = process.argv.slice(2);
    const options = {
        force: false,
        shuffle: false,
        unassignedOnly: false,
        showOnly: false,
        warehouseIds: [],
        categoryId: null,
        status: null
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--force':
            case '-f':
                options.force = true;
                break;
            case '--shuffle':
            case '-s':
                options.shuffle = true;
                break;
            case '--unassigned-only':
            case '-u':
                options.unassignedOnly = true;
                break;
            case '--show':
            case '--status':
                options.showOnly = true;
                break;
            case '--warehouses':
            case '-w':
                if (i + 1 < args.length) {
                    options.warehouseIds = args[i + 1].split(',');
                    i++; // Skip next argument
                }
                break;
            case '--category':
            case '-c':
                if (i + 1 < args.length) {
                    options.categoryId = args[i + 1];
                    i++; // Skip next argument
                }
                break;
            case '--product-status':
                if (i + 1 < args.length) {
                    options.status = args[i + 1];
                    i++; // Skip next argument
                }
                break;
            case '--help':
            case '-h':
                showHelp();
                process.exit(0);
                break;
        }
    }

    return options;
}

function showHelp() {
    console.log(`
🏪 Product Distribution Script

This script distributes products evenly across all warehouses in your database.

Usage:
  node distributeProducts.js [options]

Options:
  --force, -f              Force execution without confirmation
  --shuffle, -s            Randomly shuffle products before distribution
  --unassigned-only, -u    Only distribute products that don't have a warehouse assigned
  --show, --status         Show current distribution without making changes
  --warehouses, -w <ids>   Comma-separated list of warehouse IDs to use (default: all)
  --category, -c <id>      Only distribute products from specific category
  --product-status <status> Only distribute products with specific status (active/inactive)
  --help, -h               Show this help message

Examples:
  # Show current distribution
  node distributeProducts.js --show

  # Distribute all active products across all warehouses
  node distributeProducts.js --force

  # Distribute only unassigned products with random shuffle
  node distributeProducts.js --force --unassigned-only --shuffle

  # Distribute products from specific category to specific warehouses
  node distributeProducts.js --force --category 60f1b2b3c4d5e6f7g8h9i0j1 --warehouses 60a1b2c3d4e5f6g7h8i9j0k1,60b1c2d3e4f5g6h7i8j9k0l1

⚠️  Warning: This script will modify your database. Always backup your data first!
`);
}

// Main execution
async function main() {
    const options = parseArguments();

    // Show help if no arguments provided
    if (process.argv.length === 2) {
        showHelp();
        return;
    }

    // Show current distribution
    if (options.showOnly) {
        await showCurrentDistribution();
        return;
    }

    // Validate force flag for destructive operations
    if (!options.force && !options.unassignedOnly) {
        console.log('⚠️  This script will redistribute products across warehouses.');
        console.log('⚠️  This will overwrite existing warehouse assignments!');
        console.log('');
        console.log('Options:');
        console.log('  - Use --force to proceed with redistribution');
        console.log('  - Use --unassigned-only to only assign unassigned products');
        console.log('  - Use --show to see current distribution');
        console.log('  - Use --help for more options');
        console.log('');
        return;
    }

    // Run the distribution
    const result = await distributeProductsEvenly(options);
    
    if (result.success) {
        console.log('\n✅ Script completed successfully!');
    } else {
        console.log('\n❌ Script failed:', result.error);
        process.exit(1);
    }
}

// Run the script
main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});