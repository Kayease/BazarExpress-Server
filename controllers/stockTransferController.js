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
            const { productId, quantity } = item;
            
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

            // Check stock availability
            if (product.stock < quantity) {
                return res.status(400).json({
                    error: `Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${quantity}`
                });
            }

            // Deduct stock from source warehouse immediately (pending status)
            await Product.findByIdAndUpdate(
                productId,
                { $inc: { stock: -quantity } }
            );

            const itemTotal = product.price * quantity;
            processedItems.push({
                product: productId,
                productName: product.name,
                sku: product.sku || `SKU-${productId}`,
                quantity: quantity,
                unitPrice: product.price,
                totalPrice: itemTotal
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

        await stockTransfer.save();
        
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

        // Check if product exists in destination warehouse by SKU
        let destinationProduct = await Product.findOne({
            sku: item.sku,
            warehouse: transfer.toWarehouse
        });

        if (destinationProduct) {
            // Product exists, update quantity
            await Product.findByIdAndUpdate(
                destinationProduct._id,
                { $inc: { stock: item.quantity } }
            );
        } else {
            // Product doesn't exist, create new entry with all details
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
                video: sourceProduct.video,
                model3d: sourceProduct.model3d,
                metaTitle: sourceProduct.metaTitle,
                metaDescription: sourceProduct.metaDescription,
                metaKeywords: sourceProduct.metaKeywords,
                canonicalUrl: sourceProduct.canonicalUrl,
                legal_hsn: sourceProduct.legal_hsn,
                batchNumber: sourceProduct.batchNumber,
                manufacturer: sourceProduct.manufacturer,
                warranty: sourceProduct.warranty,
                certifications: sourceProduct.certifications,
                safetyInfo: sourceProduct.safetyInfo,
                mrp: sourceProduct.mrp,
                variants: sourceProduct.variants,
                attributes: sourceProduct.attributes,
                createdBy: sourceProduct.createdBy
            };

            await Product.create(newProductData);
        }
    }
};

// Helper function to return stock to source warehouse
exports.returnStockToSource = async (transfer) => {
    for (const item of transfer.items) {
        // Return stock to source warehouse
        await Product.findByIdAndUpdate(
            item.product,
            { $inc: { stock: item.quantity } }
        );
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