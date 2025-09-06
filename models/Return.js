const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  image: { type: String },
  category: { type: String },
  brand: { type: String },
  // Tax information from original order item
  priceIncludesTax: { type: Boolean, default: false },
  tax: {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tax' },
    name: { type: String },
    percentage: { type: Number },
    description: { type: String }
  },
  // Variant information
  variantId: { type: String },
  variantName: { type: String },
  selectedVariant: { type: Object },
  // Link back to the specific order item id
  orderItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
  // Return specific fields
  returnReason: { type: String, required: true },
  returnStatus: { 
    type: String, 
    enum: ['requested', 'approved', 'pickup_assigned', 'pickup_rejected', 'picked_up', 'received', 'refunded', 'rejected'], 
    default: 'requested' 
  },
  refundAmount: { type: Number },
  refundedAt: { type: Date },
  refundId: { type: String } // Razorpay refund ID
});

const returnSchema = new mongoose.Schema({
  returnId: { type: String, required: true, unique: true },
  orderId: { type: String, required: true },
  orderObjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Customer Information
  customerInfo: {
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String, required: true }
  },
  
  // Return Items
  items: [returnItemSchema],
  
  // Overall Return Status
  status: {
    type: String,
    enum: ['requested', 'approved', 'pickup_assigned', 'pickup_rejected', 'picked_up', 'received', 'partially_refunded', 'refunded', 'rejected'],
    default: 'requested'
  },
  
  // Return Reason
  returnReason: { type: String, required: true },
  
  // Pickup Information
  pickupInfo: {
    address: {
      type: { type: String, enum: ["Office", "Home", "Hotel", "Other"] },
      building: { type: String },
      floor: { type: String },
      area: { type: String },
      landmark: { type: String },
      city: { type: String },
      state: { type: String },
      country: { type: String, default: 'India' },
      pincode: { type: String },
      phone: { type: String },
      name: { type: String },
      lat: { type: Number },
      lng: { type: Number },
      additionalInstructions: { type: String }
    },
    preferredPickupTime: { type: String },
    pickupInstructions: { type: String }
  },
  
  // Delivery Agent Assignment for Pickup
  assignedPickupAgent: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String },
    phone: { type: String },
    assignedAt: { type: Date },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  
  // Pickup OTP for verification
  pickupOtp: {
    otp: { type: String },
    generatedAt: { type: Date },
    expiresAt: { type: Date },
    verified: { type: Boolean, default: false }
  },
  
  // Status History
  statusHistory: [{
    status: { type: String },
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String }
  }],
  
  // Refund Information
  refundInfo: {
    totalRefundAmount: { type: Number },
    refundMethod: { type: String, enum: ['original_payment', 'bank_transfer', 'wallet'] },
    refundStatus: { type: String, enum: ['pending', 'processed', 'failed'], default: 'pending' },
    refundedAt: { type: Date },
    refundId: { type: String }, // Razorpay refund ID
    refundDetails: {
      bankAccount: { type: String },
      ifscCode: { type: String },
      accountHolderName: { type: String }
    }
  },

  // Amount actually refunded to customer (for partial refunds and full refunds)
  refundedAmount: { type: Number, default: 0 },

  // User's selected refund preference on request
  refundPreference: {
    method: { type: String, enum: ['upi', 'bank'] },
    upiId: { type: String },
    bankDetails: {
      accountHolderName: { type: String },
      accountNumber: { type: String },
      ifsc: { type: String },
      bankName: { type: String }
    }
  },
  
  // Quality Check Information
  qualityCheck: {
    checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    checkedAt: { type: Date },
    condition: { type: String, enum: ['good', 'damaged', 'used', 'defective'] },
    notes: { type: String },
    images: [{ type: String }] // URLs of quality check images
  },
  
  // Notes and Instructions
  notes: {
    customerNotes: { type: String },
    adminNotes: { type: String },
    pickupInstructions: { type: String }
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  
  // Expected and Actual Pickup Dates
  expectedPickupDate: { type: Date },
  actualPickupDate: { type: Date },
  
  // Warehouse Information (where the return will be processed)
  warehouseInfo: {
    warehouseId: { type: String },
    warehouseName: { type: String },
    warehouseAddress: { type: String }
  }
});

// Indexes for better query performance
// Note: returnId already has unique index from schema definition
returnSchema.index({ orderId: 1 });
returnSchema.index({ userId: 1 });
returnSchema.index({ status: 1 });
returnSchema.index({ createdAt: -1 });
returnSchema.index({ 'assignedPickupAgent.id': 1 });

// Pre-save middleware to update timestamps
returnSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to generate return ID
returnSchema.statics.generateReturnId = function() {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RET-${timestamp.slice(-8)}-${random}`;
};

// Instance method to add status history
returnSchema.methods.addStatusHistory = function(status, updatedBy, note = '') {
  this.statusHistory.push({
    status,
    updatedBy,
    note,
    timestamp: new Date()
  });
  this.status = status;
  this.updatedAt = new Date();
};

// Instance method to calculate total refund amount
returnSchema.methods.calculateRefundAmount = function() {
  const totalRefund = this.items.reduce((sum, item) => {
    return sum + (item.refundAmount || (item.price * item.quantity));
  }, 0);
  
  this.refundInfo.totalRefundAmount = totalRefund;
  return totalRefund;
};

module.exports = mongoose.model('Return', returnSchema);