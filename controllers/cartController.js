const User = require('../models/User');
const Product = require('../models/Product');

// Get user's cart
const getCart = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate({
            path: 'cart.productId',
            model: 'Product'
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Filter out any cart items where the product no longer exists
        const validCartItems = user.cart.filter(item => item.productId);

        // If we filtered out any items, update the user's cart
        if (validCartItems.length !== user.cart.length) {
            user.cart = validCartItems;
            await user.save();
        }

        res.json({ cart: validCartItems });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({ error: 'Failed to get cart' });
    }
};

// Add item to cart
const addToCart = async (req, res) => {
    try {
        const { productId, quantity = 1 } = req.body;

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

        // Check if item already exists in cart
        const existingItemIndex = user.cart.findIndex(
            item => item.productId.toString() === productId
        );

        if (existingItemIndex > -1) {
            // Update quantity if item exists
            user.cart[existingItemIndex].quantity += quantity;
        } else {
            // Add new item to cart
            user.cart.push({
                productId,
                quantity,
                addedAt: new Date()
            });
        }

        await user.save();

        // Populate the cart for response
        await user.populate({
            path: 'cart.productId',
            model: 'Product'
        });

        res.json({ 
            message: 'Item added to cart successfully',
            cart: user.cart 
        });
    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({ error: 'Failed to add item to cart' });
    }
};

// Update cart item quantity
const updateCartItem = async (req, res) => {
    try {
        const { productId, quantity } = req.body;

        if (!productId || quantity === undefined) {
            return res.status(400).json({ error: 'Product ID and quantity are required' });
        }

        if (quantity < 0) {
            return res.status(400).json({ error: 'Quantity cannot be negative' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const cartItemIndex = user.cart.findIndex(
            item => item.productId.toString() === productId
        );

        if (cartItemIndex === -1) {
            return res.status(404).json({ error: 'Item not found in cart' });
        }

        if (quantity === 0) {
            // Remove item if quantity is 0
            user.cart.splice(cartItemIndex, 1);
        } else {
            // Update quantity
            user.cart[cartItemIndex].quantity = quantity;
        }

        await user.save();

        // Populate the cart for response
        await user.populate({
            path: 'cart.productId',
            model: 'Product'
        });

        res.json({ 
            message: 'Cart updated successfully',
            cart: user.cart 
        });
    } catch (error) {
        console.error('Update cart error:', error);
        res.status(500).json({ error: 'Failed to update cart' });
    }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
    try {
        const { productId } = req.params;

        if (!productId) {
            return res.status(400).json({ error: 'Product ID is required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const initialLength = user.cart.length;
        user.cart = user.cart.filter(
            item => item.productId.toString() !== productId
        );

        if (user.cart.length === initialLength) {
            return res.status(404).json({ error: 'Item not found in cart' });
        }

        await user.save();

        // Populate the cart for response
        await user.populate({
            path: 'cart.productId',
            model: 'Product'
        });

        res.json({ 
            message: 'Item removed from cart successfully',
            cart: user.cart 
        });
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({ error: 'Failed to remove item from cart' });
    }
};

// Clear entire cart
const clearCart = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.cart = [];
        await user.save();

        res.json({ 
            message: 'Cart cleared successfully',
            cart: [] 
        });
    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({ error: 'Failed to clear cart' });
    }
};

// Sync local cart with database cart
const syncCart = async (req, res) => {
    try {
        const { localCart } = req.body;

        if (!Array.isArray(localCart)) {
            return res.status(400).json({ error: 'Local cart must be an array' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Process each item in local cart
        for (const localItem of localCart) {
            const { id: productId, quantity } = localItem;
            
            if (!productId || !quantity) continue;

            // Verify product exists
            const product = await Product.findById(productId);
            if (!product) continue;

            // Check if item already exists in database cart
            const existingItemIndex = user.cart.findIndex(
                item => item.productId.toString() === productId
            );

            if (existingItemIndex > -1) {
                // Update quantity (add local quantity to existing)
                user.cart[existingItemIndex].quantity += quantity;
            } else {
                // Add new item to cart
                user.cart.push({
                    productId,
                    quantity,
                    addedAt: new Date()
                });
            }
        }

        await user.save();

        // Populate the cart for response
        await user.populate({
            path: 'cart.productId',
            model: 'Product'
        });

        res.json({ 
            message: 'Cart synced successfully',
            cart: user.cart 
        });
    } catch (error) {
        console.error('Sync cart error:', error);
        res.status(500).json({ error: 'Failed to sync cart' });
    }
};

module.exports = {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    syncCart
};