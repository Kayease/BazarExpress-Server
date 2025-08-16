/**
 * Product Form Cleanup Migration Script
 * 
 * This script removes deprecated fields from existing products and updates the schema:
 * - Removes: costPrice, allowBackorders, canonicalUrl, video, model3d
 * - Removes: legal_hsn, batchNumber, manufacturer, warranty, certifications, safetyInfo
 * - Sets priceIncludesTax to true by default for existing products
 * - Adds locationName field (empty string by default)
 * - Updates stockStatus based on quantity (auto-calculated)
 * 
 * Run this script after updating the frontend form to ensure data consistency.
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
async function connectDB() {
    try {
        const mongoUri = process.env.DB_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/bazar';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

// Migration function
async function migrateProducts() {
    try {
        console.log('🚀 Starting product form cleanup migration...');
        
        // Get the Product collection directly
        const db = mongoose.connection.db;
        const productsCollection = db.collection('products');
        
        // Count total products
        const totalProducts = await productsCollection.countDocuments();
        console.log(`📊 Found ${totalProducts} products to migrate`);
        
        if (totalProducts === 0) {
            console.log('ℹ️  No products found. Migration completed.');
            return;
        }
        
        // Update all products
        const updateResult = await productsCollection.updateMany(
            {}, // Match all products
            {
                $set: {
                    // Set priceIncludesTax to true by default if not already set
                    priceIncludesTax: true,
                    // Add locationName field (empty string by default)
                    locationName: ""
                },
                $unset: {
                    // Remove deprecated fields
                    costPrice: "",
                    allowBackorders: "",
                    canonicalUrl: "",
                    video: "",
                    model3d: "",
                    legal_hsn: "",
                    batchNumber: "",
                    manufacturer: "",
                    warranty: "",
                    certifications: "",
                    safetyInfo: ""
                }
            }
        );
        
        console.log(`✅ Updated ${updateResult.modifiedCount} products`);
        
        // Update stockStatus based on stock/quantity for all products
        console.log('🔄 Updating stock status based on quantity...');
        
        // Get all products to update stockStatus individually
        const products = await productsCollection.find({}).toArray();
        let stockStatusUpdated = 0;
        
        for (const product of products) {
            const quantity = product.quantity || product.stock || 0;
            const newStockStatus = quantity > 0;
            
            // Only update if stockStatus is different
            if (product.stockStatus !== newStockStatus) {
                await productsCollection.updateOne(
                    { _id: product._id },
                    { $set: { stockStatus: newStockStatus } }
                );
                stockStatusUpdated++;
            }
        }
        
        console.log(`✅ Updated stock status for ${stockStatusUpdated} products`);
        
        // Verify migration results
        console.log('🔍 Verifying migration results...');
        
        const sampleProduct = await productsCollection.findOne({});
        if (sampleProduct) {
            console.log('📋 Sample product after migration:');
            console.log(`   - priceIncludesTax: ${sampleProduct.priceIncludesTax}`);
            console.log(`   - locationName: "${sampleProduct.locationName || ''}"`);
            console.log(`   - stockStatus: ${sampleProduct.stockStatus}`);
            console.log(`   - quantity: ${sampleProduct.quantity || sampleProduct.stock || 0}`);
            
            // Check if deprecated fields are removed
            const deprecatedFields = ['costPrice', 'allowBackorders', 'canonicalUrl', 'video', 'model3d', 'legal_hsn', 'batchNumber', 'manufacturer', 'warranty', 'certifications', 'safetyInfo'];
            const remainingDeprecatedFields = deprecatedFields.filter(field => sampleProduct.hasOwnProperty(field));
            
            if (remainingDeprecatedFields.length === 0) {
                console.log('✅ All deprecated fields successfully removed');
            } else {
                console.log(`⚠️  Some deprecated fields still exist: ${remainingDeprecatedFields.join(', ')}`);
            }
        }
        
        console.log('🎉 Product form cleanup migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Main execution
async function main() {
    try {
        await connectDB();
        await migrateProducts();
        
        console.log('\n📝 Migration Summary:');
        console.log('   ✅ Removed deprecated fields: costPrice, allowBackorders, canonicalUrl, video, model3d');
        console.log('   ✅ Removed legal fields: legal_hsn, batchNumber, manufacturer, warranty, certifications, safetyInfo');
        console.log('   ✅ Set priceIncludesTax to true by default');
        console.log('   ✅ Added locationName field');
        console.log('   ✅ Updated stockStatus based on quantity');
        console.log('\n⚠️  Important Notes:');
        console.log('   - Make sure to update your frontend form before running this migration');
        console.log('   - Backup your database before running this migration in production');
        console.log('   - Test thoroughly in development environment first');
        
    } catch (error) {
        console.error('❌ Migration script failed:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
}

// Run the migration
if (require.main === module) {
    main();
}

module.exports = { migrateProducts };