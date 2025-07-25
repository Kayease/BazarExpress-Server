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