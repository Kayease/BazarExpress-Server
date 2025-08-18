const StockTransfer = require("../models/StockTransfer");
const Product = require("../models/Product");
const Warehouse = require("../models/Warehouse");
const mongoose = require("mongoose");

// Create a new stock transfer
exports.createStockTransfer = async (req, res, next) => {
    try {
        const { fromWarehouse, toWarehouse, items, notes } = req.body;
        const userId = req.user._id || req.user.id;

        // Validation
        if (!fromWarehouse || !toWarehouse || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                error: "Missing required fields: fromWarehouse, toWarehouse, items"
            });
        }

        if (fromWarehouse === toWarehouse) {
            return res.status(400).json({
                error: "From warehouse and to warehouse cannot be the same"
            });
        }

        // Verify warehouses exist
        const [fromWarehouseDoc, toWarehouseDoc] = await Promise.all([
            Warehouse.findById(fromWarehouse),
            Warehouse.findById(toWarehouse)
        ]);

        if (!fromWarehouseDoc) {
            return res.status(404).json({ error: "From warehouse not found" });
        }
        if (!toWarehouseDoc) {
            return res.status(404).json({ error: "To warehouse not found" });
        }

        // Process and validate items
        const processedItems = [];
        let totalValue = 0;
        let totalItems = 0;

        for (const item of items) {
            const { productId, quantity, variantKey, variantDetails } = item;
            
            if (!productId || !quantity || quantity <= 0) {
                return res.status(400).json({
                    error: "Each item must have productId and positive quantity"
                });
            }

            // Find product in from warehouse
            const product = await Product.findOne({
                _id: productId,
                warehouse: fromWarehouse
            });

            if (!product) {
                return res.status(404).json({
                    error: `Product not found in source warehouse: ${productId}`
                });
            }

            let itemPrice = product.price;
            let itemSku = product.sku || `SKU-${productId}`;
            let availableStock = product.stock;
            let actualVariantKey = variantKey; // Track the actual variant key used

            // Handle variant products
            if (variantKey && product.variants) {
                console.log(`🔍 Looking for variant with key: "${variantKey}"`);
                console.log(`🔍 Available variants:`, Object.keys(product.variants));
                
                // Try to find variant with exact key first, then try normalized key
                let variant = product.variants[variantKey];
                console.log(`🔍 Exact match found:`, !!variant);
                
                if (!variant) {
                    // Try normalized uppercase key
                    const normalizedKey = variantKey.split('::').map(v => v.toUpperCase()).join('::');
                    console.log(`🔍 Trying normalized key: "${normalizedKey}"`);
                    variant = product.variants[normalizedKey];
                    if (variant) {
                        actualVariantKey = normalizedKey;
                        console.log(`✅ Found variant with normalized key: "${normalizedKey}"`);
                    }
                }
                
                if (!variant) {
                    // Try to find by case-insensitive search
                    console.log(`🔍 Trying case-insensitive search for: "${variantKey.toLowerCase()}"`);
                    const foundEntry = Object.entries(product.variants).find(([key, _]) => 
                        key.toLowerCase() === variantKey.toLowerCase()
                    );
                    if (foundEntry) {
                        actualVariantKey = foundEntry[0];
                        variant = foundEntry[1];
                        console.log(`✅ Found variant with case-insensitive search: "${actualVariantKey}"`);
                    }
                }
                
                if (variant) {
                    itemPrice = Number(variant.price) || product.price;
                    itemSku = variant.sku || `${product.sku}-${actualVariantKey}`;
                    availableStock = Number(variant.stock) || 0; // Convert to number

                    // Check variant stock availability
                    if (availableStock < quantity) {
                        return res.status(400).json({
                            error: `Insufficient stock for variant ${actualVariantKey} of product ${product.name}. Available: ${availableStock}, Requested: ${quantity}`
                        });
                    }

                    // Deduct stock from variant using the actual key found
                    const updatedVariants = { ...product.variants };
                    const newVariantStock = availableStock - quantity;
                    updatedVariants[actualVariantKey] = {
                        ...updatedVariants[actualVariantKey],
                        stock: String(newVariantStock) // Store as string to match existing format
                    };

                    // Update product with new variant stock and recalculate total stock
                    const totalVariantStock = Object.values(updatedVariants).reduce((total, v) => total + (Number(v.stock) || 0), 0);
                    
                    console.log(`📦 Updating variant stock for product ${product.name}:`);
                    console.log(`   Variant: ${actualVariantKey}`);
                    console.log(`   Previous stock: ${availableStock}`);
                    console.log(`   Quantity transferred: ${quantity}`);
                    console.log(`   New variant stock: ${newVariantStock}`);
                    console.log(`   New total stock: ${totalVariantStock}`);
                    
                    await Product.findByIdAndUpdate(productId, {
                        variants: updatedVariants,
                        stock: totalVariantStock
                    });

                    // Verify the update was successful
                    const updatedProduct = await Product.findById(productId);
                    const updatedVariantStock = Number(updatedProduct.variants[actualVariantKey]?.stock) || 0;
                    console.log(`✅ Verification - Updated variant stock: ${updatedVariantStock}, Total stock: ${updatedProduct.stock}`);
                } else {
                    console.log(`❌ Variant "${variantKey}" not found in product "${product.name}"`);
                    console.log(`❌ Available variants:`, Object.keys(product.variants));
                    return res.status(400).json({
                        error: `Variant ${variantKey} not found in product ${product.name}. Available variants: ${Object.keys(product.variants).join(', ')}`
                    });
                }
            } else {
                // Handle main product
                if (availableStock < quantity) {
                    return res.status(400).json({
                        error: `Insufficient stock for product ${product.name}. Available: ${availableStock}, Requested: ${quantity}`
                    });
                }

                // Deduct stock from main product
                await Product.findByIdAndUpdate(
                    productId,
                    { $inc: { stock: -quantity } }
                );
            }

            // Prepare variant information for display
            let variantName = null;
            
            if (actualVariantKey && product.variants) {
                // Create a readable variant name from the actual variant key used
                variantName = actualVariantKey.replace('::', ' - ');
            }

            const itemTotal = itemPrice * quantity;
            
            console.log(`📝 Creating transfer item:`);
            console.log(`   Product: ${product.name}`);
            console.log(`   SKU: ${itemSku}`);
            console.log(`   Quantity: ${quantity}`);
            console.log(`   Variant Key: ${actualVariantKey || 'null'}`);
            console.log(`   Variant Name: ${variantName || 'null'}`);
            
            processedItems.push({
                product: productId,
                productName: product.name,
                sku: itemSku, // Now contains proper variant SKU
                mainSku: product.sku, // Add main product SKU for display purposes
                quantity: quantity,
                unitPrice: itemPrice,
                totalPrice: itemTotal,
                variantKey: actualVariantKey || null, // Use the actual key that was used for the update
                variantName: variantName, // Added for display
                variantDetails: variantDetails || null
            });

            totalValue += itemTotal;
            totalItems += quantity;
        }

        // Create stock transfer
        const stockTransfer = new StockTransfer({
            fromWarehouse,
            toWarehouse,
            items: processedItems,
            totalItems,
            totalValue,
            status: 'pending',
            notes,
            createdBy: userId,
            statusHistory: [{
                status: 'pending',
                changedBy: userId,
                changedAt: new Date(),
                notes: 'Stock transfer created and stock deducted from source warehouse'
            }]
        });

        try {
            await stockTransfer.save();
        } catch (saveError) {
            // If it's a duplicate key error, try to regenerate the ID
            if (saveError.code === 11000 && saveError.keyPattern?.transferId) {
                console.log('Duplicate transferId detected, regenerating...');
                stockTransfer.transferId = undefined; // Reset to trigger regeneration
                await stockTransfer.save();
            } else {
                throw saveError;
            }
        }
        
        // Populate the response
        const populatedTransfer = await StockTransfer.findById(stockTransfer._id)
            .populate('fromWarehouse', 'name address')
            .populate('toWarehouse', 'name address')
            .populate('createdBy', 'name email')
            .populate('items.product', 'name image sku');

        res.status(201).json({
            success: true,
            message: "Stock transfer created successfully. Stock has been deducted from source warehouse.",
            data: populatedTransfer
        });

    } catch (error) {
        console.error('Error creating stock transfer:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Get all stock transfers with filtering
exports.getStockTransfers = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            fromWarehouse,
            toWarehouse,
            startDate,
            endDate,
            search
        } = req.query;

        // Build query
        let query = {};

        if (status) {
            query.status = status;
        }

        if (fromWarehouse) {
            query.fromWarehouse = fromWarehouse;
        }

        if (toWarehouse) {
            query.toWarehouse = toWarehouse;
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                query.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                query.createdAt.$lte = new Date(endDate);
            }
        }

        if (search) {
            query.$or = [
                { transferId: { $regex: search, $options: 'i' } },
                { notes: { $regex: search, $options: 'i' } }
            ];
        }

        // Role-based filtering
        if (req.user.role === 'product_inventory_management' && req.assignedWarehouseIds) {
            query.$or = [
                { fromWarehouse: { $in: req.assignedWarehouseIds } },
                { toWarehouse: { $in: req.assignedWarehouseIds } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [transfers, totalCount] = await Promise.all([
            StockTransfer.find(query)
                .populate('fromWarehouse', 'name address')
                .populate('toWarehouse', 'name address')
                .populate('createdBy', 'name email')
                .populate('processedBy', 'name email')
                .populate('completedBy', 'name email')
                .populate('items.product', 'name image sku')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            StockTransfer.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: transfers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                pages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error fetching stock transfers:', error);
        next(error);
    }
};

// Get single stock transfer
exports.getStockTransfer = async (req, res, next) => {
    try {
        const { id } = req.params;

        const transfer = await StockTransfer.findById(id)
            .populate('fromWarehouse', 'name address contactPhone email')
            .populate('toWarehouse', 'name address contactPhone email')
            .populate('createdBy', 'name email')
            .populate('processedBy', 'name email')
            .populate('completedBy', 'name email')
            .populate('items.product', 'name image sku description')
            .populate('statusHistory.changedBy', 'name email');

        if (!transfer) {
            return res.status(404).json({
                error: "Stock transfer not found"
            });
        }

        res.json({
            success: true,
            data: transfer
        });

    } catch (error) {
        console.error('Error fetching stock transfer:', error);
        next(error);
    }
};

// Update stock transfer status
exports.updateStockTransferStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const userId = req.user._id || req.user.id;

        if (!status || !['pending', 'in-transit', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({
                error: "Invalid status. Must be one of: pending, in-transit, completed, cancelled"
            });
        }

        const transfer = await StockTransfer.findById(id);
        if (!transfer) {
            return res.status(404).json({
                error: "Stock transfer not found"
            });
        }

        const currentStatus = transfer.status;

        // Check if transfer is already in a final state (completed or cancelled)
        if (currentStatus === 'completed') {
            return res.status(400).json({
                success: false,
                error: "Cannot modify a completed stock transfer. The transfer has been finalized and stock has been moved to the destination warehouse.",
                currentStatus: currentStatus,
                requestedStatus: status
            });
        }

        if (currentStatus === 'cancelled') {
            return res.status(400).json({
                success: false,
                error: "Cannot modify a cancelled stock transfer. The transfer has been cancelled and stock has been returned to the source warehouse.",
                currentStatus: currentStatus,
                requestedStatus: status
            });
        }

        // Status transition validation for active transfers
        const validTransitions = {
            'pending': ['in-transit', 'cancelled'],
            'in-transit': ['completed', 'cancelled'],
            'completed': [], // Cannot change from completed (handled above)
            'cancelled': [] // Cannot change from cancelled (handled above)
        };

        if (!validTransitions[currentStatus].includes(status)) {
            return res.status(400).json({
                success: false,
                error: `Invalid status transition from '${currentStatus}' to '${status}'. Valid transitions from '${currentStatus}' are: ${validTransitions[currentStatus].join(', ') || 'none'}`,
                currentStatus: currentStatus,
                requestedStatus: status,
                validTransitions: validTransitions[currentStatus]
            });
        }

        // Handle status-specific logic
        if (status === 'completed') {
            // Transfer stock to destination warehouse
            await this.transferStockToDestination(transfer);
            transfer.completedBy = userId;
        } else if (status === 'cancelled') {
            // Return stock to source warehouse
            await this.returnStockToSource(transfer);
            transfer.cancellationReason = notes;
        }

        // Update transfer status
        transfer.status = status;
        transfer.processedBy = userId;
        if (notes) {
            transfer.notes = notes;
        }

        // Add status history entry
        transfer.statusHistory.push({
            status: status,
            changedBy: userId,
            changedAt: new Date(),
            notes: notes || `Status changed to ${status}`
        });

        await transfer.save();

        // Return updated transfer
        const updatedTransfer = await StockTransfer.findById(id)
            .populate('fromWarehouse', 'name address')
            .populate('toWarehouse', 'name address')
            .populate('createdBy', 'name email')
            .populate('processedBy', 'name email')
            .populate('completedBy', 'name email')
            .populate('items.product', 'name image sku');

        res.json({
            success: true,
            message: `Stock transfer status updated to ${status}`,
            data: updatedTransfer
        });

    } catch (error) {
        console.error('Error updating stock transfer status:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Helper function to transfer stock to destination warehouse
exports.transferStockToDestination = async (transfer) => {
    for (const item of transfer.items) {
        const sourceProduct = await Product.findById(item.product);
        if (!sourceProduct) {
            throw new Error(`Source product not found: ${item.product}`);
        }

        // Handle variant products
        let itemVariantKey = item.variantKey;
        
        // If variantKey is not stored (for older transfers), try to derive it from SKU
        if (!itemVariantKey && item.sku !== sourceProduct.sku && sourceProduct.variants) {
            // Try to find variant by SKU
            const variantEntry = Object.entries(sourceProduct.variants).find(([key, variant]) => 
                variant.sku === item.sku
            );
            if (variantEntry) {
                itemVariantKey = variantEntry[0];
                console.log(`🔍 Derived variant key "${itemVariantKey}" from SKU "${item.sku}"`);
            }
        }
        
        if (itemVariantKey && sourceProduct.variants) {
            console.log(`🔄 Processing variant transfer for key: "${itemVariantKey}"`);
            
            // Find the source variant (with case-insensitive search)
            let sourceVariant = sourceProduct.variants[itemVariantKey];
            let actualSourceVariantKey = itemVariantKey;
            
            if (!sourceVariant) {
                // Try normalized uppercase key
                const normalizedKey = itemVariantKey.split('::').map(v => v.toUpperCase()).join('::');
                sourceVariant = sourceProduct.variants[normalizedKey];
                if (sourceVariant) {
                    actualSourceVariantKey = normalizedKey;
                }
            }
            
            if (!sourceVariant) {
                // Try case-insensitive search
                const foundEntry = Object.entries(sourceProduct.variants).find(([key, _]) => 
                    key.toLowerCase() === itemVariantKey.toLowerCase()
                );
                if (foundEntry) {
                    actualSourceVariantKey = foundEntry[0];
                    sourceVariant = foundEntry[1];
                }
            }
            
            if (sourceVariant) {
                // Find destination product by main product SKU (not variant SKU)
                // Try multiple approaches to find the existing product
                let destinationProduct = await Product.findOne({
                    sku: sourceProduct.sku,
                    warehouse: transfer.toWarehouse
                });

                // If not found by exact SKU, try to find by name and warehouse
                if (!destinationProduct) {
                    destinationProduct = await Product.findOne({
                        name: { $regex: new RegExp(`^${sourceProduct.name}s?$`, 'i') }, // Match "Shoe" or "Shoes"
                        warehouse: transfer.toWarehouse
                    });
                }

                // If still not found, try to find any product with similar name in the warehouse
                if (!destinationProduct) {
                    destinationProduct = await Product.findOne({
                        name: { $regex: new RegExp(sourceProduct.name.replace(/s$/, ''), 'i') },
                        warehouse: transfer.toWarehouse
                    });
                }

                if (destinationProduct) {
                    console.log(`✅ Found destination product: "${destinationProduct.name}" (ID: ${destinationProduct._id}) in warehouse`);
                    // Product exists, check if variant exists
                    const updatedVariants = { ...destinationProduct.variants };
                    
                    // Normalize the variant key for destination (use uppercase)
                    const normalizedVariantKey = actualSourceVariantKey.split('::').map(v => v.toUpperCase()).join('::');
                    
                    if (updatedVariants[normalizedVariantKey]) {
                        // Variant exists, update stock
                        const currentStock = Number(updatedVariants[normalizedVariantKey].stock) || 0;
                        const newStock = currentStock + item.quantity;
                        updatedVariants[normalizedVariantKey] = {
                            ...updatedVariants[normalizedVariantKey],
                            stock: String(newStock) // Store as string
                        };
                        console.log(`📦 Adding to existing variant ${normalizedVariantKey}: ${currentStock} + ${item.quantity} = ${newStock}`);
                    } else {
                        // Variant doesn't exist, add it with normalized key
                        updatedVariants[normalizedVariantKey] = {
                            ...sourceVariant,
                            stock: String(item.quantity) // Store as string
                        };
                        console.log(`📦 Creating new variant ${normalizedVariantKey} with stock: ${item.quantity}`);
                    }

                    // Recalculate total stock from all variants
                    const totalVariantStock = Object.values(updatedVariants).reduce((total, v) => total + (Number(v.stock) || 0), 0);

                    console.log(`📦 Updating destination product ${destinationProduct.name}:`);
                    console.log(`   Variant: ${normalizedVariantKey}`);
                    console.log(`   Quantity added: ${item.quantity}`);
                    console.log(`   New total stock: ${totalVariantStock}`);

                    // Update attributes if new variant values are introduced
                    const updatedAttributes = await updateProductAttributes(destinationProduct, normalizedVariantKey);

                    await Product.findByIdAndUpdate(destinationProduct._id, {
                        variants: updatedVariants,
                        stock: totalVariantStock,
                        attributes: updatedAttributes
                    });

                    // Verify the update was successful
                    const updatedDestProduct = await Product.findById(destinationProduct._id);
                    const updatedDestVariantStock = Number(updatedDestProduct.variants[normalizedVariantKey]?.stock) || 0;
                    console.log(`✅ Verification - Destination variant stock: ${updatedDestVariantStock}, Total stock: ${updatedDestProduct.stock}`);
                } else {
                    console.log(`❌ No destination product found. Creating new product for "${sourceProduct.name}"`);
                    // Product doesn't exist, create new entry with variant
                    const newVariants = {};
                    const normalizedVariantKey = actualSourceVariantKey.split('::').map(v => v.toUpperCase()).join('::');
                    newVariants[normalizedVariantKey] = {
                        ...sourceVariant,
                        stock: String(item.quantity) // Store as string
                    };

                    const newProductData = {
                        name: sourceProduct.name,
                        price: sourceProduct.price,
                        unit: sourceProduct.unit,
                        image: sourceProduct.image,
                        rating: sourceProduct.rating,
                        deliveryTime: sourceProduct.deliveryTime,
                        description: sourceProduct.description,
                        brand: sourceProduct.brand,
                        category: sourceProduct.category,
                        subcategory: sourceProduct.subcategory,
                        warehouse: transfer.toWarehouse,
                        warehouseId: transfer.toWarehouse,
                        tax: sourceProduct.tax,
                        stock: item.quantity, // Total stock equals variant stock for new product
                        status: sourceProduct.status,
                        sku: sourceProduct.sku,
                        hsn: sourceProduct.hsn,
                        costPrice: sourceProduct.costPrice,
                        priceIncludesTax: sourceProduct.priceIncludesTax,
                        allowBackorders: sourceProduct.allowBackorders,
                        lowStockThreshold: sourceProduct.lowStockThreshold,
                        weight: sourceProduct.weight,
                        dimensions: sourceProduct.dimensions,
                        shippingClass: sourceProduct.shippingClass,
                        returnable: sourceProduct.returnable,
                        returnWindow: sourceProduct.returnWindow,
                        codAvailable: sourceProduct.codAvailable,
                        mainImage: sourceProduct.mainImage,
                        galleryImages: sourceProduct.galleryImages,
                        metaTitle: sourceProduct.metaTitle,
                        metaDescription: sourceProduct.metaDescription,
                        metaKeywords: sourceProduct.metaKeywords,
                        locationName: sourceProduct.locationName || "",
                        mrp: sourceProduct.mrp,
                        variants: newVariants,
                        attributes: await updateProductAttributes(sourceProduct, normalizedVariantKey),
                        createdBy: sourceProduct.createdBy
                    };

                    await Product.create(newProductData);
                }
            } else {
                throw new Error(`Variant ${itemVariantKey} not found in product ${sourceProduct.name}`);
            }
        } else {
            // Handle main product transfer
            // Try multiple approaches to find the existing product
            let destinationProduct = await Product.findOne({
                sku: sourceProduct.sku,
                warehouse: transfer.toWarehouse
            });

            // If not found by exact SKU, try to find by name and warehouse
            if (!destinationProduct) {
                destinationProduct = await Product.findOne({
                    name: { $regex: new RegExp(`^${sourceProduct.name}s?$`, 'i') }, // Match "Shoe" or "Shoes"
                    warehouse: transfer.toWarehouse
                });
            }

            // If still not found, try to find any product with similar name in the warehouse
            if (!destinationProduct) {
                destinationProduct = await Product.findOne({
                    name: { $regex: new RegExp(sourceProduct.name.replace(/s$/, ''), 'i') },
                    warehouse: transfer.toWarehouse
                });
            }

            if (destinationProduct) {
                // Product exists, add stock
                await Product.findByIdAndUpdate(destinationProduct._id, {
                    $inc: { stock: item.quantity }
                });
            } else {
                // Product doesn't exist, create new entry
                const newProductData = {
                    name: sourceProduct.name,
                    price: sourceProduct.price,
                    unit: sourceProduct.unit,
                    image: sourceProduct.image,
                    rating: sourceProduct.rating,
                    deliveryTime: sourceProduct.deliveryTime,
                    description: sourceProduct.description,
                    brand: sourceProduct.brand,
                    category: sourceProduct.category,
                    subcategory: sourceProduct.subcategory,
                    warehouse: transfer.toWarehouse,
                    warehouseId: transfer.toWarehouse,
                    tax: sourceProduct.tax,
                    stock: item.quantity,
                    status: sourceProduct.status,
                    sku: sourceProduct.sku,
                    hsn: sourceProduct.hsn,
                    costPrice: sourceProduct.costPrice,
                    priceIncludesTax: sourceProduct.priceIncludesTax,
                    allowBackorders: sourceProduct.allowBackorders,
                    lowStockThreshold: sourceProduct.lowStockThreshold,
                    weight: sourceProduct.weight,
                    dimensions: sourceProduct.dimensions,
                    shippingClass: sourceProduct.shippingClass,
                    returnable: sourceProduct.returnable,
                    returnWindow: sourceProduct.returnWindow,
                    codAvailable: sourceProduct.codAvailable,
                    mainImage: sourceProduct.mainImage,
                    galleryImages: sourceProduct.galleryImages,
                    metaTitle: sourceProduct.metaTitle,
                    metaDescription: sourceProduct.metaDescription,
                    metaKeywords: sourceProduct.metaKeywords,
                    locationName: sourceProduct.locationName || "",
                    mrp: sourceProduct.mrp,
                    variants: sourceProduct.variants,
                    attributes: sourceProduct.attributes,
                    createdBy: sourceProduct.createdBy
                };

                await Product.create(newProductData);
            }
        }
    }
};

// Helper function to return stock to source warehouse
exports.returnStockToSource = async (transfer) => {
    for (const item of transfer.items) {
        const sourceProduct = await Product.findById(item.product);
        if (!sourceProduct) {
            throw new Error(`Source product not found: ${item.product}`);
        }

        // Handle variant products
        let itemVariantKey = item.variantKey;
        
        // If variantKey is not stored (for older transfers), try to derive it from SKU
        if (!itemVariantKey && item.sku !== sourceProduct.sku && sourceProduct.variants) {
            // Try to find variant by SKU
            const variantEntry = Object.entries(sourceProduct.variants).find(([key, variant]) => 
                variant.sku === item.sku
            );
            if (variantEntry) {
                itemVariantKey = variantEntry[0];
                console.log(`🔍 Derived variant key "${itemVariantKey}" from SKU "${item.sku}" for return`);
            }
        }
        
        if (itemVariantKey && sourceProduct.variants) {
            // Find variant with case-insensitive search
            let variant = sourceProduct.variants[itemVariantKey];
            let actualVariantKey = itemVariantKey;
            
            if (!variant) {
                // Try normalized uppercase key
                const normalizedKey = itemVariantKey.split('::').map(v => v.toUpperCase()).join('::');
                variant = sourceProduct.variants[normalizedKey];
                if (variant) {
                    actualVariantKey = normalizedKey;
                }
            }
            
            if (!variant) {
                // Try case-insensitive search
                const foundEntry = Object.entries(sourceProduct.variants).find(([key, _]) => 
                    key.toLowerCase() === itemVariantKey.toLowerCase()
                );
                if (foundEntry) {
                    actualVariantKey = foundEntry[0];
                    variant = foundEntry[1];
                }
            }
            
            if (variant) {
                // Return stock to variant
                const updatedVariants = { ...sourceProduct.variants };
                const currentStock = Number(updatedVariants[actualVariantKey].stock) || 0;
                const newStock = currentStock + item.quantity;
                updatedVariants[actualVariantKey] = {
                    ...updatedVariants[actualVariantKey],
                    stock: String(newStock) // Store as string
                };

                // Recalculate total stock from all variants
                const totalVariantStock = Object.values(updatedVariants).reduce((total, v) => total + (Number(v.stock) || 0), 0);

                console.log(`🔄 Returning stock to variant ${actualVariantKey}:`);
                console.log(`   Previous stock: ${currentStock}`);
                console.log(`   Quantity returned: ${item.quantity}`);
                console.log(`   New variant stock: ${newStock}`);
                console.log(`   New total stock: ${totalVariantStock}`);

                await Product.findByIdAndUpdate(item.product, {
                    variants: updatedVariants,
                    stock: totalVariantStock
                });

                // Verify the update was successful
                const updatedProduct = await Product.findById(item.product);
                const updatedVariantStock = Number(updatedProduct.variants[actualVariantKey]?.stock) || 0;
                console.log(`✅ Verification - Returned variant stock: ${updatedVariantStock}, Total stock: ${updatedProduct.stock}`);
            } else {
                throw new Error(`Variant ${itemVariantKey} not found in product ${sourceProduct.name}`);
            }
        } else {
            // Return stock to main product
            await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: item.quantity } }
            );
        }
    }
};

// Get stock transfer statistics
exports.getStockTransferStats = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        
        let matchQuery = {};
        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) {
                matchQuery.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                matchQuery.createdAt.$lte = new Date(endDate);
            }
        }

        // Role-based filtering
        if (req.user.role === 'product_inventory_management' && req.assignedWarehouseIds) {
            matchQuery.$or = [
                { fromWarehouse: { $in: req.assignedWarehouseIds.map(id => new mongoose.Types.ObjectId(id)) } },
                { toWarehouse: { $in: req.assignedWarehouseIds.map(id => new mongoose.Types.ObjectId(id)) } }
            ];
        }

        const stats = await StockTransfer.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalTransfers: { $sum: 1 },
                    totalValue: { $sum: '$totalValue' },
                    totalItems: { $sum: '$totalItems' },
                    pendingCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    inTransitCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'in-transit'] }, 1, 0] }
                    },
                    completedCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    cancelledCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                    }
                }
            }
        ]);

        const result = stats[0] || {
            totalTransfers: 0,
            totalValue: 0,
            totalItems: 0,
            pendingCount: 0,
            inTransitCount: 0,
            completedCount: 0,
            cancelledCount: 0
        };

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error fetching stock transfer stats:', error);
        next(error);
    }
};

// Delete stock transfer (only if pending)
exports.deleteStockTransfer = async (req, res, next) => {
    try {
        const { id } = req.params;

        const transfer = await StockTransfer.findById(id);
        if (!transfer) {
            return res.status(404).json({
                error: "Stock transfer not found"
            });
        }

        if (transfer.status !== 'pending') {
            return res.status(400).json({
                error: "Can only delete pending stock transfers"
            });
        }

        // Return stock to source warehouse
        await this.returnStockToSource(transfer);

        // Delete the transfer
        await StockTransfer.findByIdAndDelete(id);

        res.json({
            success: true,
            message: "Stock transfer deleted and stock returned to source warehouse"
        });

    } catch (error) {
        console.error('Error deleting stock transfer:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};

// Helper function to update product attributes when new variant values are introduced
const updateProductAttributes = async (product, variantKey) => {
    if (!variantKey || !product.attributes) {
        return product.attributes || [];
    }

    // Parse the variant key (e.g., "L::GREEN" -> ["L", "GREEN"])
    const variantValues = variantKey.split('::');
    const updatedAttributes = [...(product.attributes || [])];

    console.log(`🔧 Updating attributes for variant key: ${variantKey}`);
    console.log(`🔧 Variant values: [${variantValues.join(', ')}]`);
    console.log(`🔧 Current attributes:`, product.attributes);

    // For each variant value, check if it exists in the corresponding attribute
    variantValues.forEach((value, index) => {
        if (index < updatedAttributes.length) {
            const attribute = updatedAttributes[index];
            
            // Check if this value already exists in the attribute values
            if (!attribute.values.includes(value)) {
                console.log(`🔧 Adding new value "${value}" to attribute "${attribute.name}"`);
                attribute.values.push(value);
                
                // Sort the values for consistency (optional)
                attribute.values.sort();
            } else {
                console.log(`🔧 Value "${value}" already exists in attribute "${attribute.name}"`);
            }
        } else {
            console.log(`⚠️ Warning: Variant has more values than attributes. Value "${value}" at index ${index} has no corresponding attribute.`);
        }
    });

    console.log(`🔧 Updated attributes:`, updatedAttributes);
    return updatedAttributes;
};
