# Product Distribution Scripts

This directory contains scripts to help you manage product distribution across warehouses in your BazarXpress application.

## Scripts Overview

### 1. `distributeProducts.js` - Main Distribution Script
Distributes products evenly across all warehouses in your database.

### 2. `backupProductAssignments.js` - Backup & Restore Tool
Creates backups of current product-warehouse assignments and allows restoration.

## Quick Start

### Step 1: Create a Backup (Recommended)
Before redistributing products, create a backup of current assignments:

```bash
cd Server/scripts
node backupProductAssignments.js backup
```

### Step 2: Check Current Distribution
See how products are currently distributed:

```bash
node distributeProducts.js --show
```

### Step 3: Distribute Products
Distribute all products evenly across all warehouses:

```bash
node distributeProducts.js --force
```

## Detailed Usage

### Distribution Script Options

```bash
# Show current distribution without making changes
node distributeProducts.js --show

# Distribute all active products across all warehouses
node distributeProducts.js --force

# Only distribute products that don't have a warehouse assigned
node distributeProducts.js --force --unassigned-only

# Randomly shuffle products before distribution
node distributeProducts.js --force --shuffle

# Distribute products from specific category
node distributeProducts.js --force --category 60f1b2b3c4d5e6f7g8h9i0j1

# Distribute to specific warehouses only
node distributeProducts.js --force --warehouses 60a1b2c3d4e5f6g7h8i9j0k1,60b1c2d3e4f5g6h7i8j9k0l1

# Distribute only inactive products
node distributeProducts.js --force --product-status inactive

# Show help
node distributeProducts.js --help
```

### Backup & Restore Options

```bash
# Create backup
node backupProductAssignments.js backup

# Restore from backup
node backupProductAssignments.js restore ./backups/product-assignments-backup-2024-01-15T10-30-00-000Z.json
```

## Common Scenarios

### Scenario 1: First Time Setup
You have products but no warehouse assignments:

```bash
# Check current status
node distributeProducts.js --show

# Distribute all products
node distributeProducts.js --force
```

### Scenario 2: Adding New Products
You've added new products and want to assign them to warehouses:

```bash
# Only assign unassigned products
node distributeProducts.js --force --unassigned-only
```

### Scenario 3: Rebalancing Distribution
You want to redistribute all products for better balance:

```bash
# Create backup first
node backupProductAssignments.js backup

# Redistribute with random shuffle
node distributeProducts.js --force --shuffle
```

### Scenario 4: Category-Specific Distribution
You want to redistribute products from a specific category:

```bash
# Get category ID from your database first
node distributeProducts.js --force --category YOUR_CATEGORY_ID
```

## Safety Features

### Automatic Backups
The distribution script can automatically create backups before making changes:

```javascript
// In the script, you can modify to auto-backup
const backupPath = await backupProductAssignments();
console.log(`Backup created: ${backupPath}`);
```

### Batch Processing
The script processes products in batches to avoid memory issues with large datasets.

### Verification
After distribution, the script verifies the results and shows a summary.

## File Structure

```
scripts/
├── README.md                          # This file
├── distributeProducts.js              # Main distribution script
├── backupProductAssignments.js        # Backup & restore tool
└── backups/                          # Auto-created backup directory
    └── product-assignments-backup-*.json
```

## Troubleshooting

### Common Issues

1. **"No warehouses found"**
   - Make sure you have warehouses created in your database
   - Check the warehouse collection in MongoDB

2. **"No products found"**
   - Verify products exist in your database
   - Check if you're filtering by category or status that has no products

3. **"MongoDB connection error"**
   - Verify your `.env` file has the correct `DB_URL`
   - Check if MongoDB is accessible

4. **"Permission denied"**
   - Make sure you're running the script from the correct directory
   - Check file permissions

### Debug Mode
Add console logs to see what's happening:

```bash
# Add DEBUG=* before the command for verbose logging
DEBUG=* node distributeProducts.js --show
```

## Best Practices

1. **Always backup before redistribution**
2. **Test with `--show` first** to understand current state
3. **Use `--unassigned-only`** for new products to avoid disrupting existing assignments
4. **Use `--shuffle`** for better randomization
5. **Monitor the verification output** to ensure all products were assigned correctly

## Advanced Usage

### Custom Distribution Logic
You can modify the `distributeProducts.js` script to implement custom distribution logic:

- Distribute by product category
- Distribute by product price range
- Distribute by geographic location
- Distribute by warehouse capacity

### Integration with Other Scripts
These scripts can be integrated into your deployment pipeline or scheduled as cron jobs for automatic rebalancing.

## Support

If you encounter issues:

1. Check the console output for error messages
2. Verify your database connection
3. Ensure all required dependencies are installed
4. Check the backup files are created properly

For additional help, refer to the main application documentation or contact support.