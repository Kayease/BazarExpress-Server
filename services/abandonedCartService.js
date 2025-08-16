const AbandonedCart = require('../models/AbandonedCart');
const User = require('../models/User');
const Product = require('../models/Product');

class AbandonedCartService {
    // Get all abandoned carts - directly from user carts + session carts
    static async getAllAbandonedCarts() {
        try {
            // 1. Get registered users with items in cart (these are "abandoned" carts)
            const usersWithCarts = await User.find({
                'cart.0': { $exists: true } // Has at least one cart item
            }).populate('cart.productId');
            
            // 2. Get existing abandoned cart records for unregistered users
            const sessionAbandonedCarts = await AbandonedCart.find({
                isRegistered: false,
                status: 'active'
            });
            
            // 3. Convert registered user carts to abandoned cart format
            const registeredAbandonedCarts = usersWithCarts.map(user => ({
                _id: `user_${user._id}`,
                userId: user._id,
                userName: user.name || 'Unknown User',
                userEmail: user.email || '',
                phone: user.phone || '',
                items: user.cart.map(item => ({
                    productId: item.productId._id,
                    productName: item.productId.name,
                    productImage: item.productId.images && item.productId.images.length > 0 ? 
                        item.productId.images[0] : '',
                    price: item.productId.price,
                    quantity: item.quantity,
                    addedAt: item.addedAt
                })),
                totalValue: user.cart.reduce((sum, item) => sum + (item.productId.price * item.quantity), 0),
                isRegistered: true,
                abandonedAt: new Date(),
                lastActivity: new Date(),
                status: 'active',
                remindersSent: 0
            }));
            
            // 4. Combine both types
            const allAbandonedCarts = [...registeredAbandonedCarts, ...sessionAbandonedCarts];
            
            return allAbandonedCarts;
        } catch (error) {
            console.error('Error getting abandoned carts:', error);
            return [];
        }
    }
    
    // Track unregistered user cart in real-time
    static async trackUnregisteredUserCart(sessionId, cartItems, userInfo = {}) {
        try {
            // If cart is empty, mark existing cart as recovered and return
            if (!cartItems || cartItems.length === 0) {
                await this.markCartAsRecovered(null, sessionId);
                return null;
            }
            
            // Check if abandoned cart already exists for this session
            let existingCart = await AbandonedCart.findOne({
                sessionId,
                isRegistered: false,
                status: 'active'
            });
            
            if (existingCart) {
                // Update existing cart
                existingCart.items = cartItems;
                existingCart.lastActivity = new Date();
                existingCart.userName = userInfo.name || existingCart.userName || 'Guest User';
                existingCart.userEmail = userInfo.email || existingCart.userEmail || '';
                existingCart.phone = userInfo.phone || existingCart.phone || '';
                existingCart.totalValue = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                
                await existingCart.save();
                return existingCart;
            } else {
                // Create new abandoned cart
                const abandonedCart = new AbandonedCart({
                    sessionId,
                    userName: userInfo.name || 'Guest User',
                    userEmail: userInfo.email || '',
                    phone: userInfo.phone || '',
                    items: cartItems,
                    totalValue: cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
                    isRegistered: false,
                    abandonedAt: new Date(),
                    lastActivity: new Date(),
                    status: 'active'
                });
                
                await abandonedCart.save();
                return abandonedCart;
            }
        } catch (error) {
            console.error('Error tracking unregistered user cart:', error);
            return null;
        }
    }
    
    // Get abandoned cart statistics
    static async getAbandonedCartStats(dateFilter = {}) {
        try {
            // Get all abandoned carts
            const allCarts = await this.getAllAbandonedCarts();
            
            // Apply date filter if provided
            let filteredCarts = allCarts;
            if (dateFilter.startDate && dateFilter.endDate) {
                const start = new Date(dateFilter.startDate);
                const end = new Date(dateFilter.endDate);
                end.setHours(23, 59, 59, 999);
                
                filteredCarts = allCarts.filter(cart => {
                    const cartDate = new Date(cart.abandonedAt);
                    return cartDate >= start && cartDate <= end;
                });
            }
            
            const total = filteredCarts.length;
            const registered = filteredCarts.filter(cart => cart.isRegistered).length;
            const unregistered = filteredCarts.filter(cart => !cart.isRegistered).length;
            const totalValue = filteredCarts.reduce((sum, cart) => sum + cart.totalValue, 0);
            const averageValue = total > 0 ? totalValue / total : 0;
            
            return {
                total,
                registered,
                unregistered,
                totalValue,
                averageValue
            };
        } catch (error) {
            console.error('Error getting abandoned cart stats:', error);
            return {
                total: 0,
                registered: 0,
                unregistered: 0,
                totalValue: 0,
                averageValue: 0
            };
        }
    }
    
    // Mark cart as recovered (when user completes purchase)
    static async markCartAsRecovered(userId = null, sessionId = null) {
        try {
            if (userId) {
                // Clear user's cart
                await User.findByIdAndUpdate(userId, { $set: { cart: [] } });
                console.log(`Cleared cart for user: ${userId}`);
            }
            
            if (sessionId) {
                // Mark session cart as recovered
                await AbandonedCart.updateMany(
                    { sessionId, isRegistered: false },
                    { status: 'recovered', lastActivity: new Date() }
                );
                console.log(`Marked session cart as recovered: ${sessionId}`);
            }
            
            return true;
        } catch (error) {
            console.error('Error marking cart as recovered:', error);
            return false;
        }
    }

    // NEW: Clean up unregistered carts when user signs in
    static async cleanupUnregisteredCartsOnLogin(userId, sessionId) {
        try {
            if (!sessionId) return false;
            
            // Find and mark all unregistered carts for this session as recovered
            const result = await AbandonedCart.updateMany(
                { 
                    sessionId, 
                    isRegistered: false, 
                    status: 'active' 
                },
                { 
                    status: 'recovered', 
                    lastActivity: new Date()
                }
            );
            
            if (result.modifiedCount > 0) {
                console.log(`Cleaned up ${result.modifiedCount} unregistered carts for session ${sessionId} when user ${userId} logged in`);
            }
            
            return true;
        } catch (error) {
            console.error('Error cleaning up unregistered carts on login:', error);
            return false;
        }
    }

    // NEW: Handle cart clearing for unregistered users
    static async handleUnregisteredCartClear(sessionId) {
        try {
            if (!sessionId) return false;
            
            // Mark existing cart as recovered
            const result = await AbandonedCart.updateMany(
                { 
                    sessionId, 
                    isRegistered: false, 
                    status: 'active' 
                },
                { 
                    status: 'recovered', 
                    lastActivity: new Date()
                }
            );
            
            if (result.modifiedCount > 0) {
                console.log(`Marked ${result.modifiedCount} unregistered carts as recovered for session ${sessionId} (cart cleared)`);
            }
            
            return true;
        } catch (error) {
            console.error('Error handling unregistered cart clear:', error);
            return false;
        }
    }
    
    // Track cart activity for registered users
    static async trackCartActivity(userId, activityType = 'update') {
        try {
            if (!userId) return;
            
            // Update user's last activity timestamp
            await User.findByIdAndUpdate(userId, {
                $set: { lastCartActivity: new Date() }
            });
            
            // console.log(`Tracked cart activity for user ${userId}: ${activityType}`);
        } catch (error) {
            console.error('Error tracking cart activity:', error);
        }
    }
    
    // Check for abandoned carts and potentially send reminders
    static async checkForAbandonedCarts() {
        try {
            const abandonmentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
            
            // Find users with carts that haven't been active for 24 hours
            const usersWithAbandonedCarts = await User.find({
                'cart.0': { $exists: true }, // Has cart items
                $or: [
                    { lastCartActivity: { $lt: abandonmentThreshold } },
                    { lastCartActivity: { $exists: false } } // No activity tracked yet
                ]
            });
            
            console.log(`Found ${usersWithAbandonedCarts.length} users with potentially abandoned carts`);
            
            // Here you could add logic to send reminder emails/SMS
            // For now, just log the findings
            
            return usersWithAbandonedCarts.length;
        } catch (error) {
            console.error('Error checking for abandoned carts:', error);
            return 0;
        }
    }
    
    // Clean up old abandoned carts
    static async cleanupExpiredCarts() {
        try {
            const expirationThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
            
            const result = await AbandonedCart.updateMany(
                { 
                    lastActivity: { $lt: expirationThreshold },
                    status: 'active'
                },
                { status: 'expired' }
            );
            
            console.log(`Marked ${result.modifiedCount} expired abandoned carts`);
        } catch (error) {
            console.error('Error cleaning up expired carts:', error);
        }
    }
}

module.exports = AbandonedCartService;