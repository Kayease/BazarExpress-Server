const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  image: { type: String },
  category: { type: String },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  brand: { type: String },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  codAvailable: { type: Boolean, default: true },
  priceIncludesTax: { type: Boolean, default: false },
  tax: {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Tax' },
    name: { type: String },
    percentage: { type: Number },
    description: { type: String }
  },
  warehouse: {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
    id: { type: String },
    name: { type: String },
    address: { type: String },
    deliverySettings: {
      is24x7Delivery: { type: Boolean, default: false }
    }
  },
  warehouseId: { type: String }
});

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Customer Information
  customerInfo: {
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String, required: true }
  },
  
  // Order Items
  items: [orderItemSchema],
  
  // Pricing Information
  pricing: {
    subtotal: { type: Number, required: true },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    codCharge: { type: Number, default: 0 },
    total: { type: Number, required: true }
  },
  
  // Applied Promo Code
  promoCode: {
    code: { type: String },
    discountAmount: { type: Number, default: 0 },
    discountType: { type: String, enum: ['percentage', 'fixed'] }
  },
  
  // Tax Calculation Details
  taxCalculation: {
    isInterState: { type: Boolean, default: false },
    totalTax: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    totalCGST: { type: Number, default: 0 },
    totalSGST: { type: Number, default: 0 },
    totalIGST: { type: Number, default: 0 },
    customerState: { type: String },
    warehouseState: { type: String },
    taxBreakdown: {
      subtotal: { type: Number, default: 0 },
      cgst: {
        amount: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 }
      },
      sgst: {
        amount: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 }
      },
      igst: {
        amount: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 }
      },
      total: { type: Number, default: 0 }
    }
  },
  
  // Delivery Information
  deliveryInfo: {
    address: {
      id: { type: Number },
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
    distance: { type: Number },
    estimatedDeliveryTime: { type: String },
    deliveryCharge: { type: Number, default: 0 },
    codCharge: { type: Number, default: 0 },
    isFreeDelivery: { type: Boolean, default: false }
  },
  
  // Payment Information
  paymentInfo: {
    method: { type: String, enum: ['cod', 'online'], required: true },
    paymentMethod: { type: String }, // upi, card, wallet, netbanking for online payments
    status: { type: String, enum: ['pending', 'prepaid', 'paid', 'refunded'], default: 'pending' },
    transactionId: { type: String },
    paidAt: { type: Date }
  },
  
  // Warehouse Information
  warehouseInfo: {
    warehouseId: { type: String, required: true },
    warehouseName: { type: String, required: true },
    warehouseAddress: { type: String },
    is24x7Delivery: { type: Boolean, default: false }
  },
  
  // Delivery Agent Assignment
  assignedDeliveryBoy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String },
    phone: { type: String },
    assignedAt: { type: Date },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  
  // Delivery OTP for verification
  deliveryOtp: {
    otp: { type: String },
    generatedAt: { type: Date },
    expiresAt: { type: Date },
    verified: { type: Boolean, default: false }
  },
  
  // Order Status and Tracking
  status: { 
    type: String, 
    enum: ['new', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'], 
    default: 'new' 
  },
  
  // Status History
  statusHistory: [{
    status: { type: String },
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String }
  }],
  
  // Tracking Information
  tracking: {
    trackingNumber: { type: String },
    carrier: { type: String },
    trackingUrl: { type: String }
  },
  
  // Notes and Instructions
  notes: {
    customerNotes: { type: String },
    adminNotes: { type: String },
    deliveryInstructions: { type: String }
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  
  // Delivery Dates
  expectedDeliveryDate: { type: Date },
  actualDeliveryDate: { type: Date },
  
  // Cancellation/Refund Information
  cancellation: {
    reason: { type: String },
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    refundAmount: { type: Number },
    refundStatus: { type: String, enum: ['pending', 'processed', 'failed'] },
    refundedAt: { type: Date }
  }
});

// Indexes for better query performance
// Note: orderId already has unique index from schema definition
orderSchema.index({ userId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'paymentInfo.method': 1 });
orderSchema.index({ 'warehouseInfo.warehouseId': 1 });

// Pre-save middleware to update timestamps
orderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to generate order ID
orderSchema.statics.generateOrderId = function() {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${timestamp.slice(-8)}-${random}`;
};

// Instance method to add status history
orderSchema.methods.addStatusHistory = function(status, updatedBy, note = '') {
  this.statusHistory.push({
    status,
    updatedBy,
    note,
    timestamp: new Date()
  });
  this.status = status;
  this.updatedAt = new Date();
};

// Instance method to calculate total (rounded to avoid decimal payments)
orderSchema.methods.calculateTotal = function() {
  // If frontend provides a total, trust it as it properly handles tax calculations
  if (this.pricing.total && this.pricing.total > 0) {
    return this.pricing.total;
  }
  
  // Fallback calculation for backwards compatibility
  // Use the frontend-provided subtotal (tax-exclusive) instead of recalculating
  // because it properly handles tax-inclusive vs tax-exclusive items
  const subtotal = this.pricing.subtotal || this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = subtotal + this.pricing.taxAmount + this.pricing.deliveryCharge + this.pricing.codCharge - this.pricing.discountAmount;
  
  // Round up the final total to avoid decimal payments, keep individual components as-is
  this.pricing.subtotal = subtotal;
  this.pricing.total = Math.ceil(total);
  
  return this.pricing.total;
};

module.exports = mongoose.model('Order', orderSchema);