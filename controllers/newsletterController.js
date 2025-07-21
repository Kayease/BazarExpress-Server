const Newsletter = require('../models/Newsletter');

// Subscribe to newsletter (public endpoint)
exports.subscribe = async(req, res) => {
    try {
        const { email, source } = req.body;
        
        // Validate email
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Check if email already exists
        const existingSubscriber = await Newsletter.findOne({ email });
        
        if (existingSubscriber) {
            // If already subscribed, return success
            if (existingSubscriber.isSubscribed) {
                return res.status(200).json({ 
                    message: 'You are already subscribed to our newsletter.',
                    alreadySubscribed: true
                });
            }
            
            // If previously unsubscribed, resubscribe
            existingSubscriber.isSubscribed = true;
            existingSubscriber.subscribedAt = new Date();
            existingSubscriber.source = source || existingSubscriber.source;
            await existingSubscriber.save();
            
            return res.status(200).json({ 
                message: 'Welcome back! You have been resubscribed to our newsletter.',
                resubscribed: true
            });
        }
        
        // Create new subscriber
        const subscriber = new Newsletter({
            email,
            source: source || 'footer',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        });
        
        await subscriber.save();
        
        res.status(201).json({ 
            message: 'Thank you for subscribing to our newsletter!',
            subscribed: true
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Unsubscribe from newsletter (public endpoint)
exports.unsubscribe = async(req, res) => {
    try {
        const { email } = req.body;
        
        // Validate email
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Find subscriber
        const subscriber = await Newsletter.findOne({ email });
        
        if (!subscriber) {
            return res.status(404).json({ error: 'Email not found in our subscription list' });
        }
        
        // Update subscription status
        subscriber.isSubscribed = false;
        await subscriber.save();
        
        res.status(200).json({ message: 'You have been unsubscribed from our newsletter.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Get all subscribers (admin only)
exports.getAllSubscribers = async(req, res) => {
    try {
        const subscribers = await Newsletter.find().sort({ createdAt: -1 });
        res.json(subscribers);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Get active subscribers (admin only)
exports.getActiveSubscribers = async(req, res) => {
    try {
        const subscribers = await Newsletter.find({ isSubscribed: true }).sort({ createdAt: -1 });
        res.json(subscribers);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Delete subscriber (admin only)
exports.deleteSubscriber = async(req, res) => {
    try {
        const subscriber = await Newsletter.findByIdAndDelete(req.params.id);
        if (!subscriber) return res.status(404).json({ error: 'Subscriber not found' });
        res.json({ message: 'Subscriber deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Send newsletter email (admin only)
exports.sendNewsletter = async(req, res) => {
    try {
        const { subject, content, testEmail } = req.body;
        
        // Validate input
        if (!subject || !content) {
            return res.status(400).json({ error: 'Subject and content are required' });
        }
        
        // For testing - send to a single email
        if (testEmail) {
            // In a real implementation, you would send an actual email here
            // For now, we'll just simulate it
            console.log(`Test email sent to ${testEmail}`);
            console.log(`Subject: ${subject}`);
            console.log(`Content: ${content}`);
            
            return res.status(200).json({ 
                message: 'Test email sent successfully',
                testEmail
            });
        }
        
        // Get all active subscribers
        const subscribers = await Newsletter.find({ isSubscribed: true });
        
        if (subscribers.length === 0) {
            return res.status(404).json({ error: 'No active subscribers found' });
        }
        
        // In a real implementation, you would send emails to all subscribers here
        // For now, we'll just log the action
        console.log(`Newsletter would be sent to ${subscribers.length} subscribers`);
        
        res.status(200).json({ 
            message: `Newsletter sent to ${subscribers.length} subscribers`,
            recipientCount: subscribers.length
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Get newsletter stats (admin only)
exports.getNewsletterStats = async(req, res) => {
    try {
        const total = await Newsletter.countDocuments();
        const active = await Newsletter.countDocuments({ isSubscribed: true });
        const inactive = await Newsletter.countDocuments({ isSubscribed: false });
        
        // Get subscribers by source
        const footerSubscribers = await Newsletter.countDocuments({ source: 'footer', isSubscribed: true });
        const popupSubscribers = await Newsletter.countDocuments({ source: 'popup', isSubscribed: true });
        const checkoutSubscribers = await Newsletter.countDocuments({ source: 'checkout', isSubscribed: true });
        const otherSubscribers = await Newsletter.countDocuments({ source: 'other', isSubscribed: true });
        
        // Get recent subscribers
        const recentSubscribers = await Newsletter.find({ isSubscribed: true })
            .sort({ subscribedAt: -1 })
            .limit(5);
        
        res.json({
            total,
            active,
            inactive,
            sources: {
                footer: footerSubscribers,
                popup: popupSubscribers,
                checkout: checkoutSubscribers,
                other: otherSubscribers
            },
            recentSubscribers
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}; 