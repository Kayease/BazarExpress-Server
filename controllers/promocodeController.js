const Promocode = require('../models/Promocode');

// Get all promocodes
exports.getAllPromocodes = async(req, res) => {
    try {
        const promocodes = await Promocode.find()
            .populate('categories', 'name')
            .populate('brands', 'name')
            .populate('products', 'name');
        res.json(promocodes);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch promocodes' });
    }
};

// Get single promocode
exports.getPromocode = async(req, res) => {
    try {
        const promocode = await Promocode.findById(req.params.id)
            .populate('categories', 'name')
            .populate('brands', 'name')
            .populate('products', 'name');
        if (!promocode) return res.status(404).json({ error: 'Promocode not found' });
        res.json(promocode);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch promocode' });
    }
};

// Create promocode
exports.createPromocode = async(req, res) => {
    try {
        const promo = new Promocode(req.body);
        await promo.save();
        res.status(201).json(promo);
    } catch (err) {
        res.status(400).json({ error: err.message || 'Failed to create promocode' });
    }
};

// Update promocode
exports.updatePromocode = async(req, res) => {
    try {
        const promo = await Promocode.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!promo) return res.status(404).json({ error: 'Promocode not found' });
        res.json(promo);
    } catch (err) {
        res.status(400).json({ error: err.message || 'Failed to update promocode' });
    }
};

// Delete promocode
exports.deletePromocode = async(req, res) => {
    try {
        const promo = await Promocode.findByIdAndDelete(req.params.id);
        if (!promo) return res.status(404).json({ error: 'Promocode not found' });
        res.json({ message: 'Promocode deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete promocode' });
    }
};

// Get promocode statistics
exports.getPromocodeStats = async(req, res) => {
    try {
        const now = new Date();
        
        // Get all promocodes
        const allPromocodes = await Promocode.find();
        
        // Calculate stats
        const stats = {
            total: allPromocodes.length,
            active: allPromocodes.filter(promo => 
                promo.status === true && 
                (!promo.endDate || new Date(promo.endDate) >= now) &&
                (!promo.startDate || new Date(promo.startDate) <= now)
            ).length,
            inactive: allPromocodes.filter(promo => promo.status === false).length,
            scheduled: allPromocodes.filter(promo => 
                promo.status === true && 
                promo.startDate && 
                new Date(promo.startDate) > now
            ).length,
            expired: allPromocodes.filter(promo => 
                promo.endDate && 
                new Date(promo.endDate) < now
            ).length
        };
        
        res.json({ stats });
    } catch (err) {
        console.error('Error getting promocode stats:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Validate promocode
exports.validatePromocode = async(req, res) => {
    try {
        const { code, userId, cartItems = [], cartTotal = 0 } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Promocode is required' });
        }

        // Find the promocode
        const promocode = await Promocode.findOne({ 
            code: code.toUpperCase(),
            status: true 
        }).populate('categories brands products');

        if (!promocode) {
            return res.status(404).json({ error: 'Invalid promocode' });
        }

        // Check if promocode is active (date validation)
        const now = new Date();
        if (promocode.startDate && new Date(promocode.startDate) > now) {
            return res.status(400).json({ error: 'Promocode is not yet active' });
        }
        if (promocode.endDate && new Date(promocode.endDate) < now) {
            return res.status(400).json({ error: 'Promocode has expired' });
        }

        // Check usage limit
        if (promocode.usageLimit && promocode.totalUsed >= promocode.usageLimit) {
            return res.status(400).json({ error: 'Promocode usage limit exceeded' });
        }

        // Check single use restriction
        if (promocode.usageType === 'single_use' && userId) {
            const hasUsed = promocode.usedBy.some(usage => usage.userId.toString() === userId);
            if (hasUsed) {
                return res.status(400).json({ error: 'You have already used this promocode' });
            }
        }

        // Check minimum order amount
        if (promocode.minOrderAmount && cartTotal < promocode.minOrderAmount) {
            return res.status(400).json({ 
                error: `Minimum order amount of ₹${promocode.minOrderAmount} required` 
            });
        }

        // Check if promocode applies to cart items
        if (promocode.appliesTo !== 'all' && cartItems.length > 0) {
            const applicableItems = cartItems.filter(item => {
                if (promocode.appliesTo === 'categories') {
                    return promocode.categories.some(cat => cat._id.toString() === item.categoryId);
                }
                if (promocode.appliesTo === 'brands') {
                    return promocode.brands.some(brand => brand._id.toString() === item.brandId);
                }
                if (promocode.appliesTo === 'products') {
                    return promocode.products.some(product => product._id.toString() === item.productId);
                }
                return false;
            });

            if (applicableItems.length === 0) {
                return res.status(400).json({ 
                    error: 'This promocode is not applicable to items in your cart' 
                });
            }
        }

        // Calculate discount
        let discountAmount = 0;
        if (promocode.type === 'percentage') {
            discountAmount = (cartTotal * promocode.discount) / 100;
            if (promocode.maxDiscount && discountAmount > promocode.maxDiscount) {
                discountAmount = promocode.maxDiscount;
            }
        } else {
            discountAmount = promocode.discount;
        }

        // Ensure discount doesn't exceed cart total
        discountAmount = Math.min(discountAmount, cartTotal);

        res.json({
            valid: true,
            promocode: {
                _id: promocode._id,
                code: promocode.code,
                type: promocode.type,
                discount: promocode.discount,
                maxDiscount: promocode.maxDiscount,
                usageType: promocode.usageType
            },
            discountAmount,
            finalAmount: cartTotal - discountAmount
        });

    } catch (err) {
        console.error('Validate promocode error:', err);
        res.status(500).json({ error: 'Failed to validate promocode' });
    }
};

// Apply promocode (mark as used)
exports.applyPromocode = async(req, res) => {
    try {
        const { code, userId, orderId } = req.body;
        
        if (!code || !userId) {
            return res.status(400).json({ error: 'Code and userId are required' });
        }

        const promocode = await Promocode.findOne({ 
            code: code.toUpperCase(),
            status: true 
        });

        if (!promocode) {
            return res.status(404).json({ error: 'Invalid promocode' });
        }

        // Add usage record
        promocode.usedBy.push({
            userId,
            usedAt: new Date(),
            orderId: orderId || ''
        });
        promocode.totalUsed += 1;

        await promocode.save();

        res.json({ 
            success: true, 
            message: 'Promocode applied successfully' 
        });

    } catch (err) {
        console.error('Apply promocode error:', err);
        res.status(500).json({ error: 'Failed to apply promocode' });
    }
};

// Get available promocodes for user
exports.getAvailablePromocodes = async(req, res) => {
    try {
        const { userId, cartItems = [], cartTotal = 0 } = req.query;
        const cartTotalNum = parseFloat(cartTotal) || 0;
        
        // Parse cartItems if it's a string
        let parsedCartItems = cartItems;
        if (typeof cartItems === 'string') {
            try {
                parsedCartItems = JSON.parse(cartItems);
            } catch (e) {
                console.warn('Failed to parse cartItems:', e);
                parsedCartItems = [];
            }
        }
        

        
        // Find all active promocodes
        const now = new Date();
        const promocodes = await Promocode.find({ 
            status: true
        }).sort({ discount: -1 });


        


        const availablePromocodes = [];
        const almostAvailablePromocodes = [];

        for (const promocode of promocodes) {
            // Check if promocode has usage limit
            if (promocode.usageLimit && promocode.totalUsed >= promocode.usageLimit) {
                continue;
            }

            // Check single use restriction
            if (promocode.usageType === 'single_use' && userId) {
                const hasUsed = promocode.usedBy.some(usage => usage.userId.toString() === userId);
                if (hasUsed) {
                    continue;
                }
            }

            // Calculate potential discount
            let potentialDiscount = 0;
            if (promocode.type === 'percentage') {
                potentialDiscount = (cartTotalNum * promocode.discount) / 100;
                if (promocode.maxDiscount && potentialDiscount > promocode.maxDiscount) {
                    potentialDiscount = promocode.maxDiscount;
                }
            } else {
                potentialDiscount = promocode.discount;
            }

            const promoInfo = {
                _id: promocode._id,
                code: promocode.code,
                type: promocode.type,
                discount: promocode.discount,
                maxDiscount: promocode.maxDiscount,
                minOrderAmount: promocode.minOrderAmount,
                usageType: promocode.usageType,
                description: promocode.description,
                appliesTo: promocode.appliesTo,
                potentialDiscount: Math.min(potentialDiscount, cartTotalNum),
                endDate: promocode.endDate
            };

            // Check if promocode is currently applicable
            if (!promocode.minOrderAmount || cartTotalNum >= promocode.minOrderAmount) {
                // Check if promocode applies to cart items
                if (promocode.appliesTo === 'all') {
                    availablePromocodes.push({
                        ...promoInfo,
                        status: 'applicable',
                        message: `Save ₹${promoInfo.potentialDiscount} on this order`
                    });
                } else {
                    // For specific categories/brands/products, check if any cart items match
                    let isApplicable = false;
                    
                    if (parsedCartItems.length > 0) {
                        if (promocode.appliesTo === 'categories' && promocode.categories && promocode.categories.length > 0) {
                            isApplicable = parsedCartItems.some(item => 
                                promocode.categories.some(cat => cat._id.toString() === item.categoryId)
                            );
                        } else if (promocode.appliesTo === 'brands' && promocode.brands && promocode.brands.length > 0) {
                            isApplicable = parsedCartItems.some(item => 
                                promocode.brands.some(brand => brand._id.toString() === item.brandId)
                            );
                        } else if (promocode.appliesTo === 'products' && promocode.products && promocode.products.length > 0) {
                            isApplicable = parsedCartItems.some(item => 
                                promocode.products.some(product => product._id.toString() === item.productId)
                            );
                        }
                    }
                    
                                            if (isApplicable) {
                            availablePromocodes.push({
                                ...promoInfo,
                                status: 'applicable',
                                message: `Save ₹${promoInfo.potentialDiscount} on this order`
                            });
                        } else {
                            // Add promocodes that don't match as almost available
                            almostAvailablePromocodes.push({
                                ...promoInfo,
                                status: 'almost_available',
                                amountNeeded: 0,
                                message: `Add matching items to unlock this offer`
                            });
                        }
                }
            } else {
                // Promocode not applicable due to minimum order amount
                const amountNeeded = promocode.minOrderAmount - cartTotalNum;
                almostAvailablePromocodes.push({
                    ...promoInfo,
                    status: 'almost_available',
                    amountNeeded,
                    message: `Add ₹${amountNeeded} more to unlock this offer`
                });
            }
        }



        res.json({
            available: availablePromocodes.slice(0, 3), // Show top 3 available
            almostAvailable: almostAvailablePromocodes.slice(0, 3) // Show top 3 almost available
        });

    } catch (err) {
        console.error('Get available promocodes error:', err);
        res.status(500).json({ error: 'Failed to fetch available promocodes' });
    }
};