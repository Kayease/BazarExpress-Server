const mongoose = require('mongoose');

const invoiceSettingsSchema = new mongoose.Schema({
    businessName: {
        type: String,
        required: true,
        trim: true
    },
    formerlyKnownAs: {
        type: String,
        trim: true
    },
    gstin: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    fssai: {
        type: String,
        required: true,
        trim: true
    },
    cin: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    pan: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    termsAndConditions: [{
        type: String,
        trim: true
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Static method to get active invoice settings
invoiceSettingsSchema.statics.getActiveSettings = async function() {
    const settings = await this.findOne({ isActive: true }).sort({ updatedAt: -1 });
    
    if (!settings) {
        // Return default settings if none found
        return {
            businessName: 'Your Business Name',
            formerlyKnownAs: '',
            gstin: '',
            fssai: '',
            cin: '',
            pan: '',
            termsAndConditions: [
                'If you have any issues or queries in respect of your order, please contact customer chat support through our platform or drop in email at support@yourbusiness.com',
                'In case you need to get more information about seller\'s FSSAI status, please visit https://foscos.fssai.gov.in/ and use the FBO search option with FSSAI License / Registration number.',
                'Please note that we never ask for bank account details such as CVV, account number, UPI Pin, etc. across our support channels. For your safety please do not share these details with anyone over any medium.'
            ]
        };
    }
    
    return settings;
};

// Instance method to update settings
invoiceSettingsSchema.methods.updateSettings = function(updates, userId) {
    Object.assign(this, updates);
    this.updatedBy = userId;
    this.updatedAt = new Date();
    return this.save();
};

// Pre-save middleware
invoiceSettingsSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Ensure only one active setting at a time
invoiceSettingsSchema.pre('save', async function(next) {
    if (this.isActive && this.isNew) {
        // Deactivate all other settings
        await this.constructor.updateMany(
            { _id: { $ne: this._id }, isActive: true },
            { isActive: false, updatedAt: new Date() }
        );
    }
    next();
});

module.exports = mongoose.model('InvoiceSettings', invoiceSettingsSchema);