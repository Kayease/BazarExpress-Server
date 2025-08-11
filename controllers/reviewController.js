const Review = require('../models/Review');
const Product = require('../models/Product');
const User = require('../models/User');
const mongoose = require('mongoose');

// Get all reviews with filtering and pagination
const getReviews = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      productId,
      userId,
      status,
      rating,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    
    if (productId) filter.product = productId;
    if (userId) filter.user = userId;
    if (status) filter.status = status;
    if (rating) filter.rating = parseInt(rating);
    
    // For public API, only show approved reviews
    if (!req.user || !req.user.role || !['admin', 'super_admin', 'customer_support'].includes(req.user.role)) {
      filter.status = 'approved';
    }

    let query = Review.find(filter)
      .populate('user', 'name email')
      .populate('product', 'name image')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 });

    // Search functionality
    if (search) {
      query = query.find({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { comment: { $regex: search, $options: 'i' } }
        ]
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const reviews = await query.skip(skip).limit(parseInt(limit));
    
    const total = await Review.countDocuments(filter);
    
    res.json({
      reviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ message: 'Error fetching reviews', error: error.message });
  }
};

// Get single review
const getReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('user', 'name email')
      .populate('product', 'name image price')
      .populate('approvedBy', 'name');

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Check if user can view this review
    if (review.status !== 'approved' && 
        (!req.user || 
         (req.user._id.toString() !== review.user._id.toString() && 
          !['admin', 'super_admin', 'customer_support'].includes(req.user.role)))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(review);
  } catch (error) {
    console.error('Error fetching review:', error);
    res.status(500).json({ message: 'Error fetching review', error: error.message });
  }
};

// Create new review
const createReview = async (req, res) => {
  try {
    const { productId, rating, title, comment, images = [] } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!productId || !rating || !title || !comment) {
      return res.status(400).json({ message: 'Product ID, rating, title, and comment are required' });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if user has already reviewed this product
    const existingReview = await Review.findOne({ product: productId, user: userId });
    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this product' });
    }

    // Check if user can review (has purchased and received the product)
    const reviewCheck = await Review.canUserReview(userId, productId);
    if (!reviewCheck.canReview) {
      let message;
      if (reviewCheck.reason === 'not_purchased') {
        message = "You can't review a product you haven't purchased.";
      } else if (reviewCheck.reason === 'not_delivered') {
        message = "You can't review this product before it's delivered.";
      } else {
        message = 'You are not eligible to review this product.';
      }
      
      return res.status(403).json({ message });
    }

    // Create review
    const review = new Review({
      product: productId,
      user: userId,
      rating: parseInt(rating),
      title: title.trim(),
      comment: comment.trim(),
      images,
      verified: reviewCheck.canReview // Mark as verified if user has purchased
    });

    await review.save();
    
    // Populate the review before sending response
    await review.populate('user', 'name email');
    await review.populate('product', 'name image');

    res.status(201).json({
      message: 'Review submitted successfully and is pending approval',
      review
    });
  } catch (error) {
    console.error('Error creating review:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'You have already reviewed this product' });
    }
    res.status(500).json({ message: 'Error creating review', error: error.message });
  }
};

// Update review (only by review owner or admin)
const updateReview = async (req, res) => {
  try {
    const { rating, title, comment, images } = req.body;
    const reviewId = req.params.id;
    const userId = req.user._id;
    const userRole = req.user.role;

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Check permissions
    const isOwner = review.user.toString() === userId.toString();
    const isAdmin = ['admin', 'super_admin', 'customer_support'].includes(userRole);
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Users can only edit pending reviews, admins can edit any
    if (isOwner && review.status !== 'pending') {
      return res.status(400).json({ message: 'You can only edit pending reviews' });
    }

    // Update fields
    if (rating !== undefined) review.rating = parseInt(rating);
    if (title !== undefined) review.title = title.trim();
    if (comment !== undefined) review.comment = comment.trim();
    if (images !== undefined) review.images = images;

    // If user is editing, reset status to pending
    if (isOwner) {
      review.status = 'pending';
    }

    await review.save();
    
    await review.populate('user', 'name email');
    await review.populate('product', 'name image');

    res.json({
      message: 'Review updated successfully',
      review
    });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({ message: 'Error updating review', error: error.message });
  }
};

// Delete review
const deleteReview = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const userId = req.user._id;
    const userRole = req.user.role;

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Check permissions
    const isOwner = review.user.toString() === userId.toString();
    const isAdmin = ['admin', 'super_admin'].includes(userRole);
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Review.findByIdAndDelete(reviewId);
    
    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ message: 'Error deleting review', error: error.message });
  }
};

// Admin: Update review status
const updateReviewStatus = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const reviewId = req.params.id;
    const adminId = req.user._id;

    // Check if user is admin
    if (!['admin', 'super_admin', 'customer_support'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Update status
    review.status = status;
    if (adminNotes) review.adminNotes = adminNotes;
    
    if (status === 'approved') {
      review.approvedBy = adminId;
      review.approvedAt = new Date();
    }

    await review.save();
    
    await review.populate('user', 'name email');
    await review.populate('product', 'name image');
    await review.populate('approvedBy', 'name');

    res.json({
      message: `Review ${status} successfully`,
      review
    });
  } catch (error) {
    console.error('Error updating review status:', error);
    res.status(500).json({ message: 'Error updating review status', error: error.message });
  }
};

// Mark review as helpful
const markHelpful = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const userId = req.user._id;

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Check if user already marked as helpful
    const alreadyMarked = review.helpfulUsers.includes(userId);
    
    if (alreadyMarked) {
      // Remove helpful mark
      review.helpfulUsers = review.helpfulUsers.filter(id => id.toString() !== userId.toString());
      review.helpful = Math.max(0, review.helpful - 1);
    } else {
      // Add helpful mark
      review.helpfulUsers.push(userId);
      review.helpful += 1;
    }

    await review.save();
    
    res.json({
      message: alreadyMarked ? 'Helpful mark removed' : 'Marked as helpful',
      helpful: review.helpful,
      isHelpful: !alreadyMarked
    });
  } catch (error) {
    console.error('Error marking review as helpful:', error);
    res.status(500).json({ message: 'Error marking review as helpful', error: error.message });
  }
};

// Get review statistics
const getReviewStats = async (req, res) => {
  try {
    const stats = await Review.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalReviews = await Review.countDocuments();
    const averageRating = await Review.aggregate([
      { $match: { status: 'approved' } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' }
        }
      }
    ]);

    const formattedStats = {
      total: totalReviews,
      pending: 0,
      approved: 0,
      rejected: 0,
      flagged: 0,
      averageRating: averageRating.length > 0 ? averageRating[0].avgRating : 0
    };

    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
    });

    res.json(formattedStats);
  } catch (error) {
    console.error('Error fetching review stats:', error);
    res.status(500).json({ message: 'Error fetching review stats', error: error.message });
  }
};

// Get product reviews with rating breakdown
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Get reviews
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const reviews = await Review.find({ 
      product: productId, 
      status: 'approved' 
    })
      .populate('user', 'name')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get rating breakdown
    const ratingBreakdown = await Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(productId), status: 'approved' } },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    // Get overall stats
    const overallStats = await Review.getProductRating(productId);
    const totalReviews = await Review.countDocuments({ product: productId, status: 'approved' });

    res.json({
      reviews,
      ratingBreakdown,
      overallStats: {
        ...overallStats,
        totalReviews
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalReviews / parseInt(limit)),
        totalItems: totalReviews,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching product reviews:', error);
    res.status(500).json({ message: 'Error fetching product reviews', error: error.message });
  }
};

module.exports = {
  getReviews,
  getReview,
  createReview,
  updateReview,
  deleteReview,
  updateReviewStatus,
  markHelpful,
  getReviewStats,
  getProductReviews
};