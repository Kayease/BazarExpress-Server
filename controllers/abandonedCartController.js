const AbandonedCart = require('../models/AbandonedCart');
const User = require('../models/User');
const Product = require('../models/Product');
const AbandonedCartService = require('../services/abandonedCartService');

// Get all abandoned carts with filtering and pagination
const getAbandonedCarts = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            isRegistered, 
            search, 
            timeFilter,
            startDate,
            endDate,
            sortBy = 'abandonedAt',
            sortOrder = 'desc'
        } = req.query;

        console.log('Abandoned cart query params:', { page, limit, isRegistered, search, timeFilter, startDate, endDate });

        // Get all abandoned carts using the simplified service
        let allCarts = await AbandonedCartService.getAllAbandonedCarts();
        
        console.log(`Total carts before filtering: ${allCarts.length}`);
        
        // Apply filters
        let filteredCarts = allCarts;
        
        // Filter by registration status
        if (isRegistered !== undefined) {
            filteredCarts = filteredCarts.filter(cart => cart.isRegistered === (isRegistered === 'true'));
            console.log(`After registration filter: ${filteredCarts.length} carts`);
        }

        // Search filter
        if (search) {
            filteredCarts = filteredCarts.filter(cart => 
                cart.userName?.toLowerCase().includes(search.toLowerCase()) ||
                cart.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
                cart.phone?.includes(search)
            );
            console.log(`After search filter: ${filteredCarts.length} carts`);
        }

        // Date range filter (new - takes precedence over timeFilter)
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            // Set end time to end of day
            end.setHours(23, 59, 59, 999);
            
            console.log('Applying date filter:', { start, end });
            
            filteredCarts = filteredCarts.filter(cart => {
                const cartDate = new Date(cart.abandonedAt);
                return cartDate >= start && cartDate <= end;
            });
            
            console.log(`After date filter: ${filteredCarts.length} carts`);
        }
        // Time filter (fallback - only if no date range specified)
        else if (timeFilter && timeFilter !== 'all') {
            const now = new Date();
            let startDate;
            
            switch (timeFilter) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case 'week':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
            }
            
            if (startDate) {
                filteredCarts = filteredCarts.filter(cart => new Date(cart.abandonedAt) >= startDate);
            }
        }

        const totalCount = filteredCarts.length;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const paginatedCarts = filteredCarts.slice(skip, skip + parseInt(limit));

        console.log(`Final result: ${paginatedCarts.length} carts on page ${page} out of ${totalCount} total`);

        // Get statistics
        const stats = await AbandonedCartService.getAbandonedCartStats({
            startDate: startDate,
            endDate: endDate
        });

        res.json({
            carts: paginatedCarts,
            stats,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalCount,
                hasNext: skip + parseInt(limit) < totalCount,
                hasPrev: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error('Get abandoned carts error:', error);
        res.status(500).json({ error: 'Failed to fetch abandoned carts' });
    }
};

// Get abandoned cart details by ID
const getAbandonedCartById = async (req, res) => {
    try {
        const { id } = req.params;

        const cart = await AbandonedCart.findById(id)
            .populate({
                path: 'items.productId',
                select: 'name images price description category brand',
                populate: [
                    { path: 'category', select: 'name' },
                    { path: 'brand', select: 'name' }
                ]
            })
            .populate({
                path: 'userId',
                select: 'name email phone'
            });

        if (!cart) {
            return res.status(404).json({ error: 'Abandoned cart not found' });
        }

        res.json({ cart });
    } catch (error) {
        console.error('Get abandoned cart by ID error:', error);
        res.status(500).json({ error: 'Failed to fetch abandoned cart details' });
    }
};

// Create abandoned cart from user's current cart
const createAbandonedCart = async (req, res) => {
    try {
        const { userId, sessionId, userInfo } = req.body;

        let user = null;
        let isRegistered = false;

        // Get user information if userId provided
        if (userId) {
            user = await User.findById(userId).populate({
                path: 'cart.productId',
                select: 'name images price'
            });
            
            if (!user || user.cart.length === 0) {
                return res.status(400).json({ error: 'User not found or cart is empty' });
            }
            isRegistered = true;
        }

        // For unregistered users, userInfo should contain cart items and user details
        if (!userId && (!userInfo || !userInfo.items || userInfo.items.length === 0)) {
            // If cart is empty, mark existing cart as recovered
            if (sessionId) {
                await AbandonedCartService.handleUnregisteredCartClear(sessionId);
            }
            return res.status(400).json({ error: 'Cart items are required for unregistered users' });
        }

        let cartItems = [];
        let userName = '';
        let userEmail = '';
        let phone = '';

        if (isRegistered) {
            // Process registered user's cart
            userName = user.name || '';
            userEmail = user.email || '';
            phone = user.phone || '';

            cartItems = user.cart.map(item => ({
                productId: item.productId._id,
                productName: item.productId.name,
                productImage: item.productId.images && item.productId.images.length > 0 ? 
                    item.productId.images[0] : '',
                price: item.productId.price,
                quantity: item.quantity,
                addedAt: item.addedAt
            }));
        } else {
            // Process unregistered user's cart
            userName = userInfo.name || 'Guest User';
            userEmail = userInfo.email || '';
            phone = userInfo.phone || '';

            // Validate and populate product information
            for (const item of userInfo.items) {
                const product = await Product.findById(item.productId).select('name images price');
                if (product) {
                    cartItems.push({
                        productId: product._id,
                        productName: product.name,
                        productImage: product.images && product.images.length > 0 ? 
                            product.images[0] : '',
                        price: product.price,
                        quantity: item.quantity,
                        addedAt: item.addedAt || new Date()
                    });
                }
            }
        }

        if (cartItems.length === 0) {
            // If no valid items, mark existing cart as recovered
            if (sessionId) {
                await AbandonedCartService.handleUnregisteredCartClear(sessionId);
            }
            return res.status(400).json({ error: 'No valid cart items found' });
        }

        // Check if abandoned cart already exists for this user/session
        const existingFilter = userId ? 
            { userId, status: 'active' } : 
            { sessionId, status: 'active' };

        const existingCart = await AbandonedCart.findOne(existingFilter);

        if (existingCart) {
            // Update existing abandoned cart
            existingCart.items = cartItems;
            existingCart.lastActivity = new Date();
            existingCart.userName = userName;
            existingCart.userEmail = userEmail;
            existingCart.phone = phone;
            existingCart.totalValue = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            await existingCart.save();
            return res.json({ 
                message: 'Abandoned cart updated successfully',
                cart: existingCart 
            });
        }

        // Create new abandoned cart
        const abandonedCart = new AbandonedCart({
            userId: userId || null,
            sessionId: sessionId || null,
            userName,
            userEmail,
            phone,
            items: cartItems,
            totalValue: cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            isRegistered,
            abandonedAt: new Date(),
            lastActivity: new Date()
        });

        await abandonedCart.save();

        res.status(201).json({ 
            message: 'Abandoned cart created successfully',
            cart: abandonedCart 
        });
    } catch (error) {
        console.error('Create abandoned cart error:', error);
        res.status(500).json({ error: 'Failed to create abandoned cart' });
    }
};

// Send reminder for abandoned cart
const sendReminder = async (req, res) => {
    try {
        const { id } = req.params;
        const { reminderType = 'email' } = req.body;

        const cart = await AbandonedCart.findById(id);
        if (!cart) {
            return res.status(404).json({ error: 'Abandoned cart not found' });
        }

        if (cart.status !== 'active') {
            return res.status(400).json({ error: 'Cannot send reminder for inactive cart' });
        }

        // Here you would integrate with your email/SMS service
        // For now, we'll just update the reminder count and timestamp
        cart.remindersSent += 1;
        cart.lastReminderSent = new Date();
        await cart.save();

        // TODO: Implement actual email/SMS sending logic
        console.log(`Sending ${reminderType} reminder for abandoned cart ${id}`);
        console.log(`User: ${cart.userName} (${cart.userEmail || cart.phone})`);
        console.log(`Items: ${cart.items.length}, Total: ₹${cart.totalValue}`);

        res.json({ 
            message: `${reminderType} reminder sent successfully`,
            remindersSent: cart.remindersSent,
            lastReminderSent: cart.lastReminderSent
        });
    } catch (error) {
        console.error('Send reminder error:', error);
        res.status(500).json({ error: 'Failed to send reminder' });
    }
};

// Mark abandoned cart as recovered
const markAsRecovered = async (req, res) => {
    try {
        const { id } = req.params;

        const cart = await AbandonedCart.findByIdAndUpdate(
            id,
            { 
                status: 'recovered',
                lastActivity: new Date()
            },
            { new: true }
        );

        if (!cart) {
            return res.status(404).json({ error: 'Abandoned cart not found' });
        }

        res.json({ 
            message: 'Abandoned cart marked as recovered',
            cart 
        });
    } catch (error) {
        console.error('Mark as recovered error:', error);
        res.status(500).json({ error: 'Failed to mark cart as recovered' });
    }
};

// Delete abandoned cart
const deleteAbandonedCart = async (req, res) => {
    try {
        const { id } = req.params;

        const cart = await AbandonedCart.findByIdAndDelete(id);
        if (!cart) {
            return res.status(404).json({ error: 'Abandoned cart not found' });
        }

        res.json({ message: 'Abandoned cart deleted successfully' });
    } catch (error) {
        console.error('Delete abandoned cart error:', error);
        res.status(500).json({ error: 'Failed to delete abandoned cart' });
    }
};

// Cleanup expired abandoned carts (utility function)
const cleanupExpiredCarts = async (req, res) => {
    try {
        const { daysOld = 30 } = req.query;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysOld));

        const result = await AbandonedCart.updateMany(
            { 
                abandonedAt: { $lt: cutoffDate },
                status: 'active'
            },
            { 
                status: 'expired',
                lastActivity: new Date()
            }
        );

        res.json({ 
            message: `Marked ${result.modifiedCount} abandoned carts as expired`,
            expiredCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Cleanup expired carts error:', error);
        res.status(500).json({ error: 'Failed to cleanup expired carts' });
    }
};

module.exports = {
    getAbandonedCarts,
    getAbandonedCartById,
    createAbandonedCart,
    sendReminder,
    markAsRecovered,
    deleteAbandonedCart,
    cleanupExpiredCarts
};