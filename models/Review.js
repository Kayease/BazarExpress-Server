const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged'],
    default: 'pending'
  },
  verified: {
    type: Boolean,
    default: false
  },
  helpful: {
    type: Number,
    default: 0
  },
  helpfulUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  images: [{
    type: String // URLs to review images
  }],
  adminNotes: {
    type: String,
    trim: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
reviewSchema.index({ product: 1, status: 1 });
reviewSchema.index({ user: 1 });
reviewSchema.index({ status: 1 });
reviewSchema.index({ createdAt: -1 });

// Prevent duplicate reviews from same user for same product
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// Virtual for formatted date
reviewSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString();
});

// Method to check if user can review (has purchased and received the product)
reviewSchema.statics.canUserReview = async function(userId, productId) {
  const Order = mongoose.model('Order');
  
  // Convert to ObjectId if needed
  const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
  const productObjectId = mongoose.Types.ObjectId.isValid(productId) ? new mongoose.Types.ObjectId(productId) : productId;
  
  // First check if user has purchased the product at all
  // Try both possible field names for user and product
  const anyOrder = await Order.findOne({
    $or: [
      { user: userObjectId, 'items.product': productObjectId },
      { userId: userObjectId, 'items.productId': productObjectId },
      { user: userObjectId, 'items.productId': productObjectId },
      { userId: userObjectId, 'items.product': productObjectId }
    ]
  });
  
  if (!anyOrder) {
    return { canReview: false, reason: 'not_purchased' };
  }
  
  // User can review if they have purchased the product and the order is:
  // - delivered (successfully received)
  // - refunded (they had the product experience)
  const deliveredOrder = await Order.findOne({
    $or: [
      { user: userObjectId, 'items.product': productObjectId, status: { $in: ['delivered', 'completed', 'refunded'] } },
      { userId: userObjectId, 'items.productId': productObjectId, status: { $in: ['delivered', 'completed', 'refunded'] } },
      { user: userObjectId, 'items.productId': productObjectId, status: { $in: ['delivered', 'completed', 'refunded'] } },
      { userId: userObjectId, 'items.product': productObjectId, status: { $in: ['delivered', 'completed', 'refunded'] } }
    ]
  });
  
  if (!deliveredOrder) {
    return { canReview: false, reason: 'not_delivered' };
  }
  
  return { canReview: true };
};

// Method to get average rating for a product
reviewSchema.statics.getProductRating = async function(productId) {
  const result = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), status: 'approved' } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);
  
  return result.length > 0 ? result[0] : { averageRating: 0, totalReviews: 0 };
};

module.exports = mongoose.model('Review', reviewSchema);