const User = require('../models/User');
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');

// Get user's cart
const getCart = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate({
            path: 'cart.productId',
            model: 'Product',
            populate: [
                {
                    path: 'tax',
                    model: 'Tax'
                },
                {
                    path: 'category',
                    model: 'Category'
                },
                {
                    path: 'brand',
                    model: 'Brand'
                },
                {
                    path: 'warehouse',
                    model: 'Warehouse'
                }
            ]
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

        // Verify product exists and populate warehouse and tax
        const product = await Product.findById(productId).populate(['warehouse', 'tax']);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        if (!product.warehouse) {
            return res.status(400).json({ error: 'Product warehouse information not found' });
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
            // Update quantity if item exists (no warehouse validation needed for existing items)
            user.cart[existingItemIndex].quantity += quantity;
        } else {
            // Warehouse validation for new items only
            if (user.cart.length > 0) {
                // Get existing cart items with warehouse information
                await user.populate({
                    path: 'cart.productId',
                    populate: [
                        {
                            path: 'warehouse',
                            model: 'Warehouse'
                        },
                        {
                            path: 'tax',
                            model: 'Tax'
                        }
                    ]
                });

                // Check for warehouse conflicts
                const currentProductWarehouse = product.warehouse;
                const isCurrentProductGlobal = currentProductWarehouse.deliverySettings?.is24x7Delivery === true;

                // Find existing custom warehouse (non-24x7) in cart
                let existingCustomWarehouse = null;
                for (const cartItem of user.cart) {
                    if (cartItem.productId && cartItem.productId.warehouse) {
                        const itemWarehouse = cartItem.productId.warehouse;
                        const isItemGlobal = itemWarehouse.deliverySettings?.is24x7Delivery === true;
                        
                        if (!isItemGlobal) {
                            existingCustomWarehouse = itemWarehouse;
                            break;
                        }
                    }
                }

                // Validation logic:
                // 1. If trying to add custom warehouse product and cart has different custom warehouse product
                if (!isCurrentProductGlobal && existingCustomWarehouse && 
                    existingCustomWarehouse._id.toString() !== currentProductWarehouse._id.toString()) {
                    return res.status(400).json({ 
                        error: 'WAREHOUSE_CONFLICT',
                        message: `Cannot add products from different custom warehouses. Your cart contains items from "${existingCustomWarehouse.name}". Please clear your cart or choose products from the same warehouse.`,
                        existingWarehouse: existingCustomWarehouse.name,
                        newWarehouse: currentProductWarehouse.name
                    });
                }
            }

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
            model: 'Product',
            populate: [
                {
                    path: 'tax',
                    model: 'Tax'
                },
                {
                    path: 'category',
                    model: 'Category'
                },
                {
                    path: 'brand',
                    model: 'Brand'
                },
                {
                    path: 'warehouse',
                    model: 'Warehouse'
                }
            ]
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
            model: 'Product',
            populate: [
                {
                    path: 'tax',
                    model: 'Tax'
                },
                {
                    path: 'category',
                    model: 'Category'
                },
                {
                    path: 'brand',
                    model: 'Brand'
                },
                {
                    path: 'warehouse',
                    model: 'Warehouse'
                }
            ]
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
            model: 'Product',
            populate: [
                {
                    path: 'tax',
                    model: 'Tax'
                },
                {
                    path: 'category',
                    model: 'Category'
                },
                {
                    path: 'brand',
                    model: 'Brand'
                },
                {
                    path: 'warehouse',
                    model: 'Warehouse'
                }
            ]
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

        // Get existing cart items with warehouse information for validation
        if (user.cart.length > 0) {
            await user.populate({
                path: 'cart.productId',
                populate: {
                    path: 'warehouse',
                    model: 'Warehouse'
                }
            });
        }

        // Find existing custom warehouse in current cart
        let existingCustomWarehouse = null;
        for (const cartItem of user.cart) {
            if (cartItem.productId && cartItem.productId.warehouse) {
                const itemWarehouse = cartItem.productId.warehouse;
                const isItemGlobal = itemWarehouse.deliverySettings?.is24x7Delivery === true;
                
                if (!isItemGlobal) {
                    existingCustomWarehouse = itemWarehouse;
                    break;
                }
            }
        }

        // Process each item in local cart
        const conflictingItems = [];
        const validItems = [];

        for (const localItem of localCart) {
            const { id: productId, quantity } = localItem;
            
            if (!productId || !quantity) continue;

            // Verify product exists and populate warehouse
            const product = await Product.findById(productId).populate('warehouse');
            if (!product || !product.warehouse) continue;

            // Check if item already exists in database cart
            const existingItemIndex = user.cart.findIndex(
                item => {
                    // Handle both populated and non-populated productId
                    const itemProductId = item.productId._id ? item.productId._id.toString() : item.productId.toString();
                    return itemProductId === productId.toString();
                }
            );

            if (existingItemIndex > -1) {
                // Update quantity to the maximum of existing and local quantity
                const existingQuantity = user.cart[existingItemIndex].quantity;
                const newQuantity = Math.max(existingQuantity, quantity);
                user.cart[existingItemIndex].quantity = newQuantity;
                validItems.push({ productId, quantity: newQuantity, action: 'updated' });
            } else {
                // Warehouse validation for new items
                const currentProductWarehouse = product.warehouse;
                const isCurrentProductGlobal = currentProductWarehouse.deliverySettings?.is24x7Delivery === true;

                // Check for warehouse conflicts
                if (!isCurrentProductGlobal && existingCustomWarehouse && 
                    existingCustomWarehouse._id.toString() !== currentProductWarehouse._id.toString()) {
                    conflictingItems.push({
                        productId,
                        productName: product.name,
                        warehouseName: currentProductWarehouse.name,
                        conflictsWith: existingCustomWarehouse.name
                    });
                } else {
                    // Add new item to cart
                    user.cart.push({
                        productId,
                        quantity,
                        addedAt: new Date()
                    });
                    validItems.push({ productId, quantity, action: 'added' });

                    // Update existing custom warehouse reference if this is a custom warehouse
                    if (!isCurrentProductGlobal && !existingCustomWarehouse) {
                        existingCustomWarehouse = currentProductWarehouse;
                    }
                }
            }
        }

        // If there are conflicting items, return partial success with warnings
        if (conflictingItems.length > 0) {
            await user.save();
            
            // Populate the cart for response
            await user.populate({
                path: 'cart.productId',
                model: 'Product',
                populate: [
                    {
                        path: 'tax',
                        model: 'Tax'
                    },
                    {
                        path: 'category',
                        model: 'Category'
                    },
                    {
                        path: 'brand',
                        model: 'Brand'
                    },
                    {
                        path: 'warehouse',
                        model: 'Warehouse'
                    }
                ]
            });

            return res.status(207).json({ // 207 Multi-Status for partial success
                message: 'Cart partially synced. Some items could not be added due to warehouse conflicts.',
                cart: user.cart,
                validItems,
                conflictingItems,
                warning: 'WAREHOUSE_CONFLICT'
            });
        }

        await user.save();

        // Populate the cart for response
        await user.populate({
            path: 'cart.productId',
            model: 'Product',
            populate: [
                {
                    path: 'tax',
                    model: 'Tax'
                },
                {
                    path: 'category',
                    model: 'Category'
                },
                {
                    path: 'brand',
                    model: 'Brand'
                },
                {
                    path: 'warehouse',
                    model: 'Warehouse'
                }
            ]
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