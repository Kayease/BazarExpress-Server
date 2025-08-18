const User = require('../models/User');
const Product = require('../models/Product');

// Get user's wishlist
const getWishlist = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate({
            path: 'wishlist.productId',
            model: 'Product'
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Filter out any wishlist items where the product no longer exists
        const validWishlistItems = user.wishlist.filter(item => item.productId);

        // If we filtered out any items, update the user's wishlist
        if (validWishlistItems.length !== user.wishlist.length) {
            user.wishlist = validWishlistItems;
            await user.save();
        }

        res.json({ wishlist: validWishlistItems });
    } catch (error) {
        console.error('Get wishlist error:', error);
        res.status(500).json({ error: 'Failed to get wishlist' });
    }
};

// Add item to wishlist
const addToWishlist = async (req, res) => {
    try {
        const { productId, variantId, variantName, selectedVariant } = req.body;

        if (!productId) {
            return res.status(400).json({ error: 'Product ID is required' });
        }

        // Verify product exists
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if item already exists in wishlist (including variant matching)
        const existingItem = user.wishlist.find(item => {
            const isSameProduct = item.productId.toString() === productId;
            
            // If both have variantId, they must match exactly
            if (item.variantId && variantId) {
                return isSameProduct && item.variantId === variantId;
            }
            
            // If neither has variantId, they match (same product, no variants)
            if (!item.variantId && !variantId) {
                return isSameProduct;
            }
            
            // If one has variantId and other doesn't, they don't match
            return false;
        });

        if (existingItem) {
            return res.status(400).json({ error: 'Item already in wishlist' });
        }

        // Add new item to wishlist
        const wishlistItem = {
            productId,
            addedAt: new Date()
        };
        
        // Add variant information if provided
        if (variantId) wishlistItem.variantId = variantId;
        if (variantName) wishlistItem.variantName = variantName;
        if (selectedVariant) wishlistItem.selectedVariant = selectedVariant;
        
        user.wishlist.push(wishlistItem);

        await user.save();

        // Populate the wishlist for response
        await user.populate({
            path: 'wishlist.productId',
            model: 'Product'
        });

        res.json({ 
            message: 'Item added to wishlist successfully',
            wishlist: user.wishlist 
        });
    } catch (error) {
        console.error('Add to wishlist error:', error);
        res.status(500).json({ error: 'Failed to add item to wishlist' });
    }
};

// Remove item from wishlist
const removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.params;
        const { variantId } = req.query;

        if (!productId) {
            return res.status(400).json({ error: 'Product ID is required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const initialLength = user.wishlist.length;
        user.wishlist = user.wishlist.filter(item => {
            const isSameProduct = item.productId.toString() === productId;
            
            // If variantId is provided, match both product and variant
            if (variantId) {
                return !(isSameProduct && item.variantId === variantId);
            }
            
            // If no variantId provided, remove items without variants only
            return !(isSameProduct && !item.variantId);
        });

        if (user.wishlist.length === initialLength) {
            return res.status(404).json({ error: 'Item not found in wishlist' });
        }

        await user.save();

        // Populate the wishlist for response
        await user.populate({
            path: 'wishlist.productId',
            model: 'Product'
        });

        res.json({ 
            message: 'Item removed from wishlist successfully',
            wishlist: user.wishlist 
        });
    } catch (error) {
        console.error('Remove from wishlist error:', error);
        res.status(500).json({ error: 'Failed to remove item from wishlist' });
    }
};

// Clear entire wishlist
const clearWishlist = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.wishlist = [];
        await user.save();

        res.json({ 
            message: 'Wishlist cleared successfully',
            wishlist: [] 
        });
    } catch (error) {
        console.error('Clear wishlist error:', error);
        res.status(500).json({ error: 'Failed to clear wishlist' });
    }
};

// Sync local wishlist with database wishlist
const syncWishlist = async (req, res) => {
    try {
        const { localWishlist } = req.body;

        if (!Array.isArray(localWishlist)) {
            return res.status(400).json({ error: 'Local wishlist must be an array' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Process each item in local wishlist
        for (const localItem of localWishlist) {
            const productId = localItem.id || localItem._id;
            const variantId = localItem.variantId;
            const variantName = localItem.variantName;
            const selectedVariant = localItem.selectedVariant;
            
            if (!productId) continue;

            // Verify product exists
            const product = await Product.findById(productId);
            if (!product) continue;

            // Check if item already exists in database wishlist (with variant matching)
            const existingItem = user.wishlist.find(item => {
                const isSameProduct = item.productId.toString() === productId;
                
                // If both have variantId, they must match exactly
                if (item.variantId && variantId) {
                    return isSameProduct && item.variantId === variantId;
                }
                
                // If neither has variantId, they match (same product, no variants)
                if (!item.variantId && !variantId) {
                    return isSameProduct;
                }
                
                // If one has variantId and other doesn't, they don't match
                return false;
            });

            if (!existingItem) {
                // Add new item to wishlist with variant information
                const wishlistItem = {
                    productId,
                    addedAt: new Date()
                };
                
                // Add variant information if provided
                if (variantId) wishlistItem.variantId = variantId;
                if (variantName) wishlistItem.variantName = variantName;
                if (selectedVariant) wishlistItem.selectedVariant = selectedVariant;
                
                user.wishlist.push(wishlistItem);
            }
        }

        await user.save();

        // Populate the wishlist for response
        await user.populate({
            path: 'wishlist.productId',
            model: 'Product'
        });

        res.json({ 
            message: 'Wishlist synced successfully',
            wishlist: user.wishlist 
        });
    } catch (error) {
        console.error('Sync wishlist error:', error);
        res.status(500).json({ error: 'Failed to sync wishlist' });
    }
};

// Check if item is in wishlist
const isInWishlist = async (req, res) => {
    try {
        const { productId } = req.params;

        if (!productId) {
            return res.status(400).json({ error: 'Product ID is required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isInWishlist = user.wishlist.some(
            item => item.productId.toString() === productId
        );

        res.json({ isInWishlist });
    } catch (error) {
        console.error('Check wishlist error:', error);
        res.status(500).json({ error: 'Failed to check wishlist' });
    }
};

module.exports = {
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    clearWishlist,
    syncWishlist,
    isInWishlist
};