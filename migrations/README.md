# Product Form Cleanup Migration

This migration script removes deprecated fields from the product form and updates existing products in the database.

## Changes Made

### Removed Fields:
- **Legal Section (Complete removal):**
  - `legal_hsn`
  - `batchNumber`
  - `manufacturer`
  - `warranty`
  - `certifications`
  - `safetyInfo`

- **Pricing Section:**
  - `costPrice`

- **Inventory Section:**
  - `allowBackorders`

- **Media Section:**
  - `video` (Product Video URL)
  - `model3d` (3D Model)

- **SEO Section:**
  - `canonicalUrl`

### Updated Fields:
- **`priceIncludesTax`**: Default changed from `false` to `true`
- **`stockStatus`**: Now auto-calculated based on quantity (read-only in form)
- **`locationName`**: New field added for product location name

## Files Modified

### Frontend:
- `frontend/components/AdvancedProductForm.tsx` - Updated form structure
- `frontend/app/products/[id]/page.tsx` - Removed deprecated field references

### Backend:
- `server/models/Product.js` - Updated schema
- `server/controllers/productController.js` - Updated field handling
- `server/controllers/stockTransferController.js` - Removed deprecated field references

## How to Run the Migration

### Prerequisites:
1. Backup your database before running the migration
2. Ensure your application is not running during migration
3. Make sure MongoDB is accessible

### Steps:

1. **Navigate to the server directory:**
   ```bash
   cd server
   ```

2. **Install dependencies (if not already done):**
   ```bash
   npm install
   ```

3. **Run the migration script:**
   ```bash
   node migrations/product-form-cleanup-migration.js
   ```

### Expected Output:
```
✅ Connected to MongoDB
🚀 Starting product form cleanup migration...
📊 Found X products to migrate
✅ Updated X products
🔄 Updating stock status based on quantity...
✅ Updated stock status for X products
🔍 Verifying migration results...
📋 Sample product after migration:
   - priceIncludesTax: true
   - locationName: ""
   - stockStatus: true
   - quantity: 10
✅ All deprecated fields successfully removed
🎉 Product form cleanup migration completed successfully!
```

## Verification

After running the migration:

1. **Check a sample product in MongoDB:**
   ```javascript
   db.products.findOne({}, {
     costPrice: 1,
     allowBackorders: 1,
     canonicalUrl: 1,
     video: 1,
     model3d: 1,
     legal_hsn: 1,
     batchNumber: 1,
     manufacturer: 1,
     warranty: 1,
     certifications: 1,
     safetyInfo: 1,
     priceIncludesTax: 1,
     locationName: 1,
     stockStatus: 1,
     quantity: 1
   })
   ```

2. **Expected result:** Deprecated fields should not exist, new fields should be present

3. **Test the frontend form** to ensure it works correctly with the updated structure

## Rollback (if needed)

If you need to rollback the migration:

1. **Restore from backup** (recommended approach)
2. **Or manually add back the fields** (not recommended for production)

## Important Notes

- ⚠️ **Always backup your database before running migrations**
- ⚠️ **Test in development environment first**
- ⚠️ **Ensure frontend changes are deployed before running migration**
- ⚠️ **Monitor application after migration for any issues**

## Support

If you encounter any issues:
1. Check the migration logs for error details
2. Verify database connectivity
3. Ensure all prerequisites are met
4. Contact the development team if problems persist