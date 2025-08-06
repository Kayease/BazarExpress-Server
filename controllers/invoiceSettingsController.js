const InvoiceSettings = require('../models/InvoiceSettings');

// Get current invoice settings
const getInvoiceSettings = async (req, res) => {
    try {
        const settings = await InvoiceSettings.getActiveSettings();
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Error fetching invoice settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching invoice settings',
            error: error.message
        });
    }
};

// Create or update invoice settings
const updateInvoiceSettings = async (req, res) => {
    try {
        const { businessName, formerlyKnownAs, gstin, fssai, cin, pan, termsAndConditions } = req.body;
        const userId = req.user?.id || req.user?._id;

        // Validate required fields
        if (!businessName || !gstin || !fssai || !cin || !pan) {
            return res.status(400).json({
                success: false,
                message: 'Required fields: businessName, gstin, fssai, cin, pan'
            });
        }

        // Check if settings already exist
        const existingSettings = await InvoiceSettings.findOne({ isActive: true });

        if (existingSettings) {
            // Update existing settings
            const updatedSettings = await existingSettings.updateSettings({
                businessName,
                formerlyKnownAs,
                gstin,
                fssai,
                cin,
                pan,
                termsAndConditions: termsAndConditions || []
            }, userId);

            res.json({
                success: true,
                message: 'Invoice settings updated successfully',
                data: updatedSettings
            });
        } else {
            // Create new settings
            const newSettings = new InvoiceSettings({
                businessName,
                formerlyKnownAs,
                gstin,
                fssai,
                cin,
                pan,
                termsAndConditions: termsAndConditions || [],
                createdBy: userId
            });

            const savedSettings = await newSettings.save();

            res.status(201).json({
                success: true,
                message: 'Invoice settings created successfully',
                data: savedSettings
            });
        }
    } catch (error) {
        console.error('Error updating invoice settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating invoice settings',
            error: error.message
        });
    }
};

// Get all invoice settings (for admin)
const getAllInvoiceSettings = async (req, res) => {
    try {
        const settings = await InvoiceSettings.find()
            .populate('createdBy', 'username email')
            .populate('updatedBy', 'username email')
            .sort({ updatedAt: -1 });

        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Error fetching all invoice settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching invoice settings',
            error: error.message
        });
    }
};

// Delete invoice settings
const deleteInvoiceSettings = async (req, res) => {
    try {
        const { id } = req.params;

        const settings = await InvoiceSettings.findById(id);
        if (!settings) {
            return res.status(404).json({
                success: false,
                message: 'Invoice settings not found'
            });
        }

        await InvoiceSettings.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Invoice settings deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting invoice settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting invoice settings',
            error: error.message
        });
    }
};

module.exports = {
    getInvoiceSettings,
    updateInvoiceSettings,
    getAllInvoiceSettings,
    deleteInvoiceSettings
};