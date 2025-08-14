const mongoose = require('mongoose');

const searchGapSchema = new mongoose.Schema({
  searchTerm: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  searchCount: {
    type: Number,
    default: 1
  },
  lastSearched: {
    type: Date,
    default: Date.now
  },
  firstSearched: {
    type: Date,
    default: Date.now
  },
  userCount: {
    type: Number,
    default: 1
  },
  searchedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    guestId: {
      type: String,
      trim: true
    },
    searchedAt: {
      type: Date,
      default: Date.now
    },
    pincode: String
  }],
  status: {
    type: String,
    enum: ['new', 'investigating', 'planned', 'added', 'rejected'],
    default: 'new'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  notes: {
    type: String,
    trim: true
  },
  estimatedDemand: {
    type: Number,
    default: 0
  },
  estimatedValue: {
    type: Number,
    default: 0
  },
  category: {
    type: String,
    trim: true
  },
  subcategory: {
    type: String,
    trim: true
  },
  similarProducts: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Index for efficient searching
searchGapSchema.index({ searchTerm: 1 });
searchGapSchema.index({ searchCount: -1 });
searchGapSchema.index({ lastSearched: -1 });
searchGapSchema.index({ status: 1 });
searchGapSchema.index({ priority: 1 });

module.exports = mongoose.model('SearchGap', searchGapSchema);