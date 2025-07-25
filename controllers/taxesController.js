const Tax = require('../models/Tax');
const Product = require('../models/Product');

// Get all taxes
exports.getAllTaxes = async(req, res) => {
    try {
        const taxes = await Tax.find().sort({ createdAt: -1 });
        res.json(taxes);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch taxes' });
    }
};

// Get a single tax by ID
exports.getTaxById = async(req, res) => {
    try {
        const tax = await Tax.findById(req.params.id);
        if (!tax) return res.status(404).json({ error: 'Tax not found' });
        res.json(tax);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tax' });
    }
};

// Create a new tax
exports.createTax = async(req, res) => {
    try {
        const tax = new Tax(req.body);
        await tax.save();
        res.status(201).json(tax);
    } catch (err) {
        res.status(400).json({ error: 'Failed to create tax', details: err.message });
    }
};

// Update a tax by ID
exports.updateTax = async(req, res) => {
    try {
        const tax = await Tax.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!tax) return res.status(404).json({ error: 'Tax not found' });
        res.json(tax);
    } catch (err) {
        res.status(400).json({ error: 'Failed to update tax', details: err.message });
    }
};

// Delete a tax by ID
exports.deleteTax = async(req, res) => {
    try {
        // Check if any product uses this tax
        const productUsingTax = await Product.findOne({ tax: req.params.id });
        if (productUsingTax) {
            return res.status(400).json({ error: 'Cannot delete tax: It is used by one or more products.' });
        }
        const tax = await Tax.findByIdAndDelete(req.params.id);
        if (!tax) return res.status(404).json({ error: 'Tax not found' });
        res.json({ message: 'Tax deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete tax' });
    }
};