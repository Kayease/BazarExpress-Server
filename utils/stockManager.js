const Product = require('../models/Product');

/**
 * Update product stock after order creation
 * @param {Array} items - Array of order items
 * @returns {Promise<void>}
 */
const updateProductStock = async (items) => {
  try {
    console.log('🔄 Starting stock update for', items.length, 'items');
    console.log('📋 Raw items data:', JSON.stringify(items, null, 2));
    
    for (const item of items) {
      const productId = item.productId || item._id;
      if (!productId) {
        console.log('⚠️ Skipping item - no productId');
        continue;
      }

      const product = await Product.findById(productId);
      if (!product) {
        console.log('⚠️ Product not found:', productId);
        continue;
      }

      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) {
        console.log('⚠️ Invalid quantity:', quantity);
        continue;
      }

      console.log(`📦 Processing product: ${product.name} (ID: ${productId})`);
      console.log(`   Quantity to deduct: ${quantity}`);
      console.log(`   Current total stock: ${product.stock}`);

      // Check if product has variants
      const variants = product.variants || {};
      const hasVariants = Object.keys(variants).length > 0;
      
      console.log(`   Has variants: ${hasVariants}`);
      if (hasVariants) {
        console.log(`   Available variants:`, Object.keys(variants));
      }

      // Extract variant information from order item
      const selectedVariant = item.selectedVariant;
      const variantId = item.variantId;
      const variantName = item.variantName;

      console.log(`   Order item variant info:`);
      console.log(`     variantId: ${variantId}`);
      console.log(`     variantName: ${variantName}`);
      console.log(`     selectedVariant:`, selectedVariant);

      let variantKey = null;

      // If product has variants, try to find the matching variant
      if (hasVariants) {
        // Method 1: Direct match by variantId (most reliable)
        if (variantId) {
          // Try direct key match first
          if (variants[variantId]) {
            variantKey = variantId;
            console.log(`✅ Found variant by direct variantId match: ${variantKey}`);
          } else {
            // Try to find by variant object properties
            for (const key of Object.keys(variants)) {
              const v = variants[key] || {};
              if (v._id?.toString() === variantId || v.id?.toString() === variantId) {
                variantKey = key;
                console.log(`✅ Found variant by object ID match: ${variantKey}`);
                break;
              }
            }
          }
        }

        // Method 2: Match by selectedVariant string
        if (!variantKey && typeof selectedVariant === 'string') {
          // Try exact match
          if (variants[selectedVariant]) {
            variantKey = selectedVariant;
            console.log(`✅ Found variant by exact selectedVariant match: ${variantKey}`);
          } else {
            // Try case-insensitive match
            const selectedLower = selectedVariant.toLowerCase();
            for (const key of Object.keys(variants)) {
              if (key.toLowerCase() === selectedLower) {
                variantKey = key;
                console.log(`✅ Found variant by case-insensitive match: ${variantKey}`);
                break;
              }
            }
          }
        }

        // Method 3: Match by variantName
        if (!variantKey && variantName) {
          const nameLower = variantName.toLowerCase();
          for (const key of Object.keys(variants)) {
            const v = variants[key] || {};
            const vName = (v.name || '').toString().toLowerCase();
            if (vName === nameLower || key.toLowerCase() === nameLower) {
              variantKey = key;
              console.log(`✅ Found variant by name match: ${variantKey}`);
              break;
            }
          }
        }

        // Method 4: If selectedVariant is an object, try to match by properties
        if (!variantKey && typeof selectedVariant === 'object' && selectedVariant) {
          for (const key of Object.keys(variants)) {
            const v = variants[key] || {};
            // Try to match by name property
            if (selectedVariant.name && v.name === selectedVariant.name) {
              variantKey = key;
              console.log(`✅ Found variant by selectedVariant object name: ${variantKey}`);
              break;
            }
            // Try to match by id property
            if (selectedVariant.id && (v.id === selectedVariant.id || v._id?.toString() === selectedVariant.id)) {
              variantKey = key;
              console.log(`✅ Found variant by selectedVariant object id: ${variantKey}`);
              break;
            }
            // Try to match by SKU - this is the most common case
            if (selectedVariant.sku && v.sku === selectedVariant.sku) {
              variantKey = key;
              console.log(`✅ Found variant by selectedVariant SKU match: ${variantKey} (SKU: ${selectedVariant.sku})`);
              break;
            }
          }
        }

        if (variantKey) {
          // Update variant stock
          const currentVariantStock = Number(variants[variantKey].stock) || 0;
          const newVariantStock = Math.max(0, currentVariantStock - quantity);

          console.log(`   Variant "${variantKey}" stock update:`);
          console.log(`     Current: ${currentVariantStock}`);
          console.log(`     Deducting: ${quantity}`);
          console.log(`     New: ${newVariantStock}`);

          // Create updated variants object
          const updatedVariants = { 
            ...variants, 
            [variantKey]: { 
              ...variants[variantKey], 
              stock: String(newVariantStock) 
            } 
          };

          // Recalculate total stock from all variants
          const totalVariantStock = Object.values(updatedVariants).reduce((sum, v) => {
            return sum + (Number((v || {}).stock) || 0);
          }, 0);

          console.log(`   Total stock after variant update: ${totalVariantStock}`);

          // Update the product
          await Product.findByIdAndUpdate(product._id, { 
            $set: { 
              variants: updatedVariants, 
              stock: totalVariantStock 
            } 
          });

          console.log(`✅ Successfully updated variant stock for ${product.name}`);
        } else {
          console.log(`❌ Could not find matching variant for product ${product.name}`);
          console.log(`   Available variants:`, Object.keys(variants));
          console.log(`   Searched for variantId: ${variantId}, variantName: ${variantName}, selectedVariant:`, selectedVariant);
        }
      } else {
        // Non-variant product: update main stock
        const currentStock = Number(product.stock) || 0;
        const newStock = Math.max(0, currentStock - quantity);
        
        console.log(`   Non-variant stock update:`);
        console.log(`     Current: ${currentStock}`);
        console.log(`     Deducting: ${quantity}`);
        console.log(`     New: ${newStock}`);

        if (newStock !== currentStock) {
          await Product.findByIdAndUpdate(product._id, { $set: { stock: newStock } });
          console.log(`✅ Successfully updated non-variant stock for ${product.name}`);
        }
      }
    }
    
    console.log('✅ Stock update completed');
  } catch (error) {
    console.error('❌ Stock update error:', error);
    throw error; // Re-throw to allow caller to handle
  }
};

/**
 * Restore product stock (for order cancellation)
 * @param {Array} items - Array of order items
 * @returns {Promise<void>}
 */
const restoreProductStock = async (items) => {
  try {
    console.log('🔄 Starting stock restoration for', items.length, 'items');
    console.log('📋 Raw items data for restoration:', JSON.stringify(items, null, 2));
    
    for (const item of items) {
      const productId = item.productId || item._id;
      if (!productId) {
        console.log('⚠️ Skipping item - no productId');
        continue;
      }

      const product = await Product.findById(productId);
      if (!product) {
        console.log('⚠️ Product not found:', productId);
        continue;
      }

      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) {
        console.log('⚠️ Invalid quantity:', quantity);
        continue;
      }

      console.log(`📦 Restoring stock for product: ${product.name} (ID: ${productId})`);
      console.log(`   Quantity to restore: ${quantity}`);
      console.log(`   Current total stock: ${product.stock}`);

      // Check if product has variants
      const variants = product.variants || {};
      const hasVariants = Object.keys(variants).length > 0;
      
      console.log(`   Has variants: ${hasVariants}`);
      if (hasVariants) {
        console.log(`   Available variants:`, Object.keys(variants));
      }

      // Extract variant information from order item
      const selectedVariant = item.selectedVariant;
      const variantId = item.variantId;
      const variantName = item.variantName;

      console.log(`   Order item variant info:`);
      console.log(`     variantId: ${variantId}`);
      console.log(`     variantName: ${variantName}`);
      console.log(`     selectedVariant:`, selectedVariant);

      let variantKey = null;

      // If product has variants, try to find the matching variant
      if (hasVariants) {
        // Method 1: Direct match by variantId (most reliable)
        if (variantId) {
          // Try direct key match first
          if (variants[variantId]) {
            variantKey = variantId;
            console.log(`✅ Found variant by direct variantId match: ${variantKey}`);
          } else {
            // Try to find by variant object properties
            for (const key of Object.keys(variants)) {
              const v = variants[key] || {};
              if (v._id?.toString() === variantId || v.id?.toString() === variantId) {
                variantKey = key;
                console.log(`✅ Found variant by object ID match: ${variantKey}`);
                break;
              }
            }
          }
        }

        // Method 2: Match by selectedVariant string
        if (!variantKey && typeof selectedVariant === 'string') {
          // Try exact match
          if (variants[selectedVariant]) {
            variantKey = selectedVariant;
            console.log(`✅ Found variant by exact selectedVariant match: ${variantKey}`);
          } else {
            // Try case-insensitive match
            const selectedLower = selectedVariant.toLowerCase();
            for (const key of Object.keys(variants)) {
              if (key.toLowerCase() === selectedLower) {
                variantKey = key;
                console.log(`✅ Found variant by case-insensitive match: ${variantKey}`);
                break;
              }
            }
          }
        }

        // Method 3: Match by variantName
        if (!variantKey && variantName) {
          const nameLower = variantName.toLowerCase();
          for (const key of Object.keys(variants)) {
            const v = variants[key] || {};
            const vName = (v.name || '').toString().toLowerCase();
            if (vName === nameLower || key.toLowerCase() === nameLower) {
              variantKey = key;
              console.log(`✅ Found variant by name match: ${variantKey}`);
              break;
            }
          }
        }

        // Method 4: If selectedVariant is an object, try to match by properties
        if (!variantKey && typeof selectedVariant === 'object' && selectedVariant) {
          for (const key of Object.keys(variants)) {
            const v = variants[key] || {};
            // Try to match by name property
            if (selectedVariant.name && v.name === selectedVariant.name) {
              variantKey = key;
              console.log(`✅ Found variant by selectedVariant object name: ${variantKey}`);
              break;
            }
            // Try to match by id property
            if (selectedVariant.id && (v.id === selectedVariant.id || v._id?.toString() === selectedVariant.id)) {
              variantKey = key;
              console.log(`✅ Found variant by selectedVariant object id: ${variantKey}`);
              break;
            }
            // Try to match by SKU - this is the most common case
            if (selectedVariant.sku && v.sku === selectedVariant.sku) {
              variantKey = key;
              console.log(`✅ Found variant by selectedVariant SKU match: ${variantKey} (SKU: ${selectedVariant.sku})`);
              break;
            }
          }
        }

        if (variantKey) {
          // Restore variant stock
          const currentVariantStock = Number(variants[variantKey].stock) || 0;
          const newVariantStock = currentVariantStock + quantity;

          console.log(`   Variant "${variantKey}" stock restoration:`);
          console.log(`     Current: ${currentVariantStock}`);
          console.log(`     Restoring: ${quantity}`);
          console.log(`     New: ${newVariantStock}`);

          // Create updated variants object
          const updatedVariants = { 
            ...variants, 
            [variantKey]: { 
              ...variants[variantKey], 
              stock: String(newVariantStock) 
            } 
          };

          // Recalculate total stock from all variants
          const totalVariantStock = Object.values(updatedVariants).reduce((sum, v) => {
            return sum + (Number((v || {}).stock) || 0);
          }, 0);

          console.log(`   Total stock after variant restoration: ${totalVariantStock}`);

          // Update the product
          await Product.findByIdAndUpdate(product._id, { 
            $set: { 
              variants: updatedVariants, 
              stock: totalVariantStock 
            } 
          });

          console.log(`✅ Successfully restored variant stock for ${product.name}`);
        } else {
          console.log(`❌ Could not find matching variant for product ${product.name}`);
          console.log(`   Available variants:`, Object.keys(variants));
          console.log(`   Searched for variantId: ${variantId}, variantName: ${variantName}, selectedVariant:`, selectedVariant);
        }
      } else {
        // Non-variant product: restore main stock
        const currentStock = Number(product.stock) || 0;
        const newStock = currentStock + quantity;
        
        console.log(`   Non-variant stock restoration:`);
        console.log(`     Current: ${currentStock}`);
        console.log(`     Restoring: ${quantity}`);
        console.log(`     New: ${newStock}`);

        await Product.findByIdAndUpdate(product._id, { $set: { stock: newStock } });
        console.log(`✅ Successfully restored non-variant stock for ${product.name}`);
      }
    }
    
    console.log('✅ Stock restoration completed');
  } catch (error) {
    console.error('❌ Stock restoration error:', error);
    throw error; // Re-throw to allow caller to handle
  }
};

module.exports = {
  updateProductStock,
  restoreProductStock
};