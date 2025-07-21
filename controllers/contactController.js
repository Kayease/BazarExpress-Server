const Contact = require('../models/Contact');

// Submit contact form (public endpoint)
exports.submitContact = async(req, res) => {
    try {
        const { name, email, subject, message, category, categoryLabel } = req.body;
        
        // Validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Create contact submission
        const contact = new Contact({
            name,
            email,
            subject,
            message,
            category: category || 'general', // Default to general if not provided
            categoryLabel: categoryLabel || 'General Inquiry', // Store the human-readable label
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        });
        
        await contact.save();
        
        res.status(201).json({ 
            message: 'Thank you for your message! We\'ll get back to you soon.',
            contactId: contact._id 
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Get all contact submissions (admin only)
exports.getAllContacts = async(req, res) => {
    try {
        const contacts = await Contact.find().sort({ createdAt: -1 });
        res.json(contacts);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Get single contact by ID (admin only)
exports.getContactById = async(req, res) => {
    try {
        const contact = await Contact.findById(req.params.id);
        if (!contact) return res.status(404).json({ error: 'Contact not found' });
        res.json(contact);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Update contact status (admin only)
exports.updateContactStatus = async(req, res) => {
    try {
        const { status } = req.body;
        if (!status || !['new', 'read', 'replied'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const contact = await Contact.findByIdAndUpdate(
            req.params.id, 
            { status }, 
            { new: true }
        );
        
        if (!contact) return res.status(404).json({ error: 'Contact not found' });
        res.json(contact);
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Delete contact (admin only)
exports.deleteContact = async(req, res) => {
    try {
        const contact = await Contact.findByIdAndDelete(req.params.id);
        if (!contact) return res.status(404).json({ error: 'Contact not found' });
        res.json({ message: 'Contact deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Get contact statistics (admin only)
exports.getContactStats = async(req, res) => {
    try {
        const total = await Contact.countDocuments();
        const newCount = await Contact.countDocuments({ status: 'new' });
        const readCount = await Contact.countDocuments({ status: 'read' });
        const repliedCount = await Contact.countDocuments({ status: 'replied' });
        
        res.json({
            total,
            new: newCount,
            read: readCount,
            replied: repliedCount
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}; 