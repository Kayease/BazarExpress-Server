const Warehouse = require("../models/Warehouse");
const Product = require("../models/Product");
const { checkPincodeConflicts, validatePincodes } = require("../utils/pincodeValidator");

// TODO: Replace with real user auth, for now use req.body.userId or req.user.id
exports.createWarehouse = async(req, res, next) => {
    try {
        const {
            name,
            address,
            location,
            contactPhone,
            email,
            capacity,
            userId,
            deliverySettings = {
                isDeliveryEnabled: false,
                disabledMessage: '',
                deliveryPincodes: [],
                is24x7Delivery: true,
                deliveryDays: [],
                deliveryHours: {
                    start: '09:00',
                    end: '18:00'
                }
            }
        } = req.body || {};

        if (!name || !address || !userId) {
            return res
                .status(400)
                .json({ error: "Missing required fields: name, address, userId" });
        }

        // Validate pincode format and uniqueness
        if (deliverySettings.deliveryPincodes && deliverySettings.deliveryPincodes.length > 0) {
            // Validate pincode format
            const validation = validatePincodes(deliverySettings.deliveryPincodes);
            if (!validation.isValid) {
                return res.status(400).json({
                    error: "Invalid pincode format",
                    message: validation.error
                });
            }

            // Check for conflicts with other warehouses
            const conflictCheck = await checkPincodeConflicts(deliverySettings.deliveryPincodes);
            if (conflictCheck.hasConflicts) {
                return res.status(400).json({
                    error: "Pincode conflict detected",
                    message: "Some pincodes are already assigned to other warehouses",
                    conflicts: conflictCheck.conflicts
                });
            }
        }

        // Create warehouse with actual form values
        const warehouse = await Warehouse.create({
            name,
            address,
            location,
            contactPhone,
            email,
            capacity,
            userId,
            deliverySettings: {
                ...deliverySettings,
                deliveryPincodes: deliverySettings.deliveryPincodes || [],
                deliveryDays: deliverySettings.deliveryDays || [],
                isDeliveryEnabled: deliverySettings.isDeliveryEnabled || false,
                is24x7Delivery: deliverySettings.is24x7Delivery || false,
                disabledMessage: deliverySettings.disabledMessage || '',
                deliveryHours: {
                    start: deliverySettings.deliveryHours?.start || '09:00',
                    end: deliverySettings.deliveryHours?.end || '18:00'
                }
            }
        });
        res.status(201).json(warehouse);
    } catch (err) {
        next(err);
    }
};

exports.getWarehouses = async(req, res, next) => {
    try {
        const { userId } = req.query;
        let warehouses;
        
        // For warehouse-specific roles, only return assigned warehouses
        if ((req.user.role === 'order_warehouse_management' || req.user.role === 'product_inventory_management') && req.assignedWarehouseIds) {
            warehouses = await Warehouse.find({ _id: { $in: req.assignedWarehouseIds } });
        } else if (req.user.role === 'delivery_boy') {
            // For delivery boys, get warehouses from orders assigned to them
            const Order = require('../models/Order');
            const assignedOrders = await Order.find({ 'assignedDeliveryBoy.id': req.user.id }).distinct('warehouseInfo.warehouseId');
            if (assignedOrders.length > 0) {
                warehouses = await Warehouse.find({ _id: { $in: assignedOrders } });
            } else {
                warehouses = []; // No warehouses if no orders assigned
            }
        } else if (userId) {
            warehouses = await Warehouse.getWarehousesByUser(userId);
        } else {
            warehouses = await Warehouse.find(); // Return all warehouses if no userId (admin)
        }
        res.json(warehouses);
    } catch (err) {
        next(err);
    }
};

exports.updateWarehouse = async(req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Validate pincode format and uniqueness for updates
        if (updates.deliverySettings && updates.deliverySettings.deliveryPincodes && updates.deliverySettings.deliveryPincodes.length > 0) {
            // Validate pincode format
            const validation = validatePincodes(updates.deliverySettings.deliveryPincodes);
            if (!validation.isValid) {
                return res.status(400).json({
                    error: "Invalid pincode format",
                    message: validation.error
                });
            }

            // Check for conflicts with other warehouses (excluding current warehouse)
            const conflictCheck = await checkPincodeConflicts(updates.deliverySettings.deliveryPincodes, id);
            if (conflictCheck.hasConflicts) {
                return res.status(400).json({
                    error: "Pincode conflict detected",
                    message: "Some pincodes are already assigned to other warehouses",
                    conflicts: conflictCheck.conflicts
                });
            }
        }
        
        updates.updatedAt = new Date();
        const updated = await Warehouse.updateWarehouse(id, updates);
        res.json(updated);
    } catch (err) {
        next(err);
    }
};

exports.checkWarehouseProducts = async(req, res, next) => {
    try {
        const { id } = req.params;
        const productsCount = await Product.countDocuments({ warehouse: id });
        const warehouse = await Warehouse.findById(id);
        
        if (!warehouse) {
            return res.status(404).json({
                message: "Warehouse not found"
            });
        }

        res.json({
            hasProducts: productsCount > 0,
            productsCount,
            warehouseName: warehouse.name
        });
    } catch (err) {
        console.error('Error checking warehouse products:', err);
        res.status(500).json({
            error: "Error checking warehouse products",
            details: err.message
        });
    }
};

exports.deleteWarehouse = async(req, res, next) => {
    try {
        const { id } = req.params;
        
        // Check role permissions - order_warehouse_management cannot delete warehouses
        if (req.user && req.user.role === 'order_warehouse_management') {
            return res.status(403).json({
                error: "You do not have permission to delete warehouses"
            });
        }
        
        // Check if warehouse exists
        const warehouse = await Warehouse.findById(id);
        if (!warehouse) {
            return res.status(404).json({
                error: "Warehouse not found"
            });
        }
        
        // Check if there are any products in this warehouse
        const productsCount = await Product.countDocuments({ warehouse: id });
        if (productsCount > 0) {
            return res.status(400).json({ 
                error: "Cannot delete warehouse that contains products. Please remove or transfer all products first.",
                productsCount,
                warehouseName: warehouse.name
            });
        }

        await Warehouse.deleteWarehouse(id);
        res.json({
            success: true,
            message: "Warehouse deleted successfully"
        });
    } catch (err) {
        console.error('Error deleting warehouse:', err);
        res.status(500).json({
            error: "Error deleting warehouse",
            details: err.message
        });
    }
};

// Check pincode availability for warehouse assignment
exports.checkPincodeAvailability = async (req, res, next) => {
    try {
        const { pincode, excludeWarehouseId } = req.query;
        
        if (!pincode || !/^\d{6}$/.test(pincode)) {
            return res.status(400).json({
                success: false,
                error: 'Valid 6-digit pincode is required'
            });
        }
        
        const conflictCheck = await checkPincodeConflicts([pincode], excludeWarehouseId);
        
        res.json({
            success: true,
            pincode,
            isAvailable: !conflictCheck.hasConflicts,
            conflicts: conflictCheck.conflicts
        });
        
    } catch (err) {
        console.error('Error checking pincode availability:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to check pincode availability',
            details: err.message
        });
    }
};

// New controller methods for dynamic delivery system

// Check pincode delivery availability and return warehouse matching logic
exports.checkPincodeDelivery = async (req, res, next) => {
    try {
        const { pincode } = req.body;
        
        if (!pincode || !/^\d{6}$/.test(pincode)) {
            return res.status(400).json({
                success: false,
                error: 'Valid 6-digit pincode is required'
            });
        }
        
        const { customWarehouses, globalWarehouses } = await Warehouse.findWarehousesByPincode(pincode);
        
        let matchedWarehouse = null;
        let deliveryStatus = null;
        let mode = 'global';
        
        // Check custom warehouses first
        if (customWarehouses.length > 0) {
            for (const warehouse of customWarehouses) {
                const status = Warehouse.isWarehouseCurrentlyDelivering(warehouse);
                
                if (status.isDelivering) {
                    matchedWarehouse = warehouse;
                    deliveryStatus = status;
                    mode = 'custom';
                    break;
                } else {
                    // Store the first disabled custom warehouse for potential overlay
                    if (!matchedWarehouse) {
                        matchedWarehouse = warehouse;
                        deliveryStatus = status;
                        mode = 'custom-disabled';
                    }
                }
            }
        }
        
        res.json({
            success: true,
            pincode,
            mode, // 'custom', 'custom-disabled', or 'global'
            matchedWarehouse,
            deliveryStatus,
            customWarehouses: customWarehouses.length,
            globalWarehouses: globalWarehouses.length,
            hasCustomWarehouse: customWarehouses.length > 0,
            hasGlobalWarehouse: globalWarehouses.length > 0
        });
        
    } catch (err) {
        console.error('Error checking pincode delivery:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to check pincode delivery',
            details: err.message
        });
    }
};

// Get products based on pincode with warehouse filtering
exports.getProductsByPincode = async (req, res, next) => {
    // Detailed request log
    // console.log('[getProductsByPincode] Called with query:', JSON.stringify(req.query));
    try {
        const { pincode, page = 1, limit = 20, category, parentCategory, search, mode = 'auto', brand, sort, minPrice, maxPrice } = req.query;
        
        if (!pincode || !/^\d{6}$/.test(pincode)) {
            return res.status(400).json({
                success: false,
                error: 'Valid 6-digit pincode is required'
            });
        }
        
        let result;
        // console.log('[getProductsByPincode] Mode:', mode, '| Category:', category, '| ParentCategory:', parentCategory, '| Search:', search, '| Page:', page, '| Limit:', limit);
        
        if (mode === 'global') {
            // console.log('[getProductsByPincode] Fetching global warehouses for pincode:', pincode);
            // Force global mode - only show 24x7 warehouses
            const globalWarehousesQuery = {
                'deliverySettings.is24x7Delivery': true,
                'deliverySettings.isDeliveryEnabled': true,
                'location.lat': { $exists: true },
                'location.lng': { $exists: true }
            };
            // console.log('[getProductsByPincode] Global warehouses query:', JSON.stringify(globalWarehousesQuery));
            const globalWarehouses = await Warehouse.find(globalWarehousesQuery);
            // console.log('[getProductsByPincode] Found global warehouses:', globalWarehouses.length);
            
            if (globalWarehouses.length === 0) {
                // console.warn('[getProductsByPincode] No global warehouses found for pincode:', pincode);
                return res.json({
                    success: true,
                    products: [],
                    totalProducts: 0,
                    deliveryMode: 'global',
                    deliveryMessage: 'No global delivery available',
                    warehouses: [],
                    pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 }
                });
            }
            
            const warehouseIds = globalWarehouses.map(w => w._id);
            // console.log('[getProductsByPincode] Global warehouse IDs:', warehouseIds);
            
            let productQuery = {
                warehouse: { $in: warehouseIds },
                status: 'active',
                stock: { $gt: 0 }
            };
            
            if (category) {
                productQuery.category = category;
                // console.log('[getProductsByPincode] Filtering by category:', category);
            }
            if (search) {
                // console.log('[getProductsByPincode] Filtering by search:', search);
                productQuery.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }
            
            // Handle brand filtering
            if (brand) {
                try {
                    const brandIds = brand.split(',').map(id => id.trim()).filter(Boolean);
                    if (brandIds.length > 0) {
                        productQuery.brand = { $in: brandIds };
                        console.log('[getProductsByPincode] Filtering by brands:', brandIds);
                    }
                } catch (error) {
                    console.error('[getProductsByPincode] Error parsing brand filter:', error);
                }
            }
            
            // Handle price filtering
            if (minPrice || maxPrice) {
                try {
                    productQuery.price = {};
                    if (minPrice && !isNaN(parseFloat(minPrice))) {
                        productQuery.price.$gte = parseFloat(minPrice);
                    }
                    if (maxPrice && !isNaN(parseFloat(maxPrice))) {
                        productQuery.price.$lte = parseFloat(maxPrice);
                    }
                    if (Object.keys(productQuery.price).length > 0) {
                        console.log('[getProductsByPincode] Filtering by price range:', { minPrice, maxPrice });
                    } else {
                        delete productQuery.price; // Remove empty price filter
                    }
                } catch (error) {
                    console.error('[getProductsByPincode] Error parsing price filter:', error);
                }
            }
            
            const skip = (parseInt(page) - 1) * parseInt(limit);
            // console.log('[getProductsByPincode] Product query:', JSON.stringify(productQuery), '| Skip:', skip, '| Limit:', limit);
            // Handle sorting
            let sortQuery = { createdAt: -1 }; // default sort
            if (sort) {
                try {
                    switch (sort) {
                        case 'price-low':
                            sortQuery = { price: 1 };
                            break;
                        case 'price-high':
                            sortQuery = { price: -1 };
                            break;
                        case 'newest':
                            sortQuery = { createdAt: -1 };
                            break;
                        case 'rating':
                            sortQuery = { rating: -1 };
                            break;
                        case 'popularity':
                            sortQuery = { popularity: -1 };
                            break;
                        case 'relevance':
                        default:
                            sortQuery = { createdAt: -1 };
                            break;
                    }
                    console.log('[getProductsByPincode] Sorting by:', sort, 'with query:', sortQuery);
                } catch (error) {
                    console.error('[getProductsByPincode] Error parsing sort parameter:', error);
                    sortQuery = { createdAt: -1 }; // fallback to default
                }
            }
            
            const [products, totalProducts] = await Promise.all([
                Product.find(productQuery)
                    .populate('category')
                    .populate('subcategory')
                    .populate('brand')
                    .populate('warehouse')
                    .skip(skip)
                    .limit(parseInt(limit))
                    .sort(sortQuery),
                Product.countDocuments(productQuery)
            ]);
            // console.log('[getProductsByPincode] Product query result:', JSON.stringify({ products, totalProducts }));
            
            result = {
                success: true,
                products,
                totalProducts,
                deliveryMode: 'global',
                deliveryMessage: 'May take few days',
                warehouses: globalWarehouses,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalProducts,
                    pages: Math.ceil(totalProducts / parseInt(limit))
                }
            };
        } else {
            // Auto mode - use warehouse logic
            // console.log('[getProductsByPincode] Using getEligibleProductsByPincode for pincode:', pincode);
            const eligibleResult = await Warehouse.getEligibleProductsByPincode(pincode, {
                page: parseInt(page),
                limit: parseInt(limit),
                category,
                parentCategory,
                search,
                brand,
                sort,
                minPrice,
                maxPrice
            });
            // console.log('[getProductsByPincode] Eligible products result:', JSON.stringify(eligibleResult));
            result = {
                success: true,
                ...eligibleResult
            };
        }
        
        // console.log('[getProductsByPincode] Sending result:', JSON.stringify(result));
        res.json(result);
        
    } catch (err) {
        console.error('Error getting products by pincode:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to get products by pincode',
            details: err.message
        });
    }
};

// Get delivery status for a specific warehouse
exports.getDeliveryStatus = async (req, res, next) => {
    try {
        const { warehouseId, timezone = 'Asia/Kolkata' } = req.body;
        
        if (!warehouseId) {
            return res.status(400).json({
                success: false,
                error: 'Warehouse ID is required'
            });
        }
        
        const warehouse = await Warehouse.findById(warehouseId);
        if (!warehouse) {
            return res.status(404).json({
                success: false,
                error: 'Warehouse not found'
            });
        }
        
        const deliveryStatus = Warehouse.isWarehouseCurrentlyDelivering(warehouse, timezone);
        
        res.json({
            success: true,
            warehouse: {
                id: warehouse._id,
                name: warehouse.name,
                type: warehouse.warehouseType,
                address: warehouse.address
            },
            deliveryStatus,
            timezone
        });
        
    } catch (err) {
        console.error('Error getting delivery status:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to get delivery status',
            details: err.message
        });
    }
};