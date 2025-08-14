const SearchGap = require('../models/SearchGap');
const Product = require('../models/Product');

// Track search gap when no products found
exports.trackSearchGap = async (req, res) => {
  try {
    const { searchTerm, userId, pincode, guestId } = req.body;
    
    if (!searchTerm || searchTerm.trim() === '') {
      return res.status(400).json({ message: 'Search term is required' });
    }

    const normalizedTerm = searchTerm.toLowerCase().trim();
    
    // Check if products exist for this search term
    const existingProducts = await Product.find({
      name: { $regex: normalizedTerm, $options: 'i' }
    }).limit(1);

    // Only track if no products found
    if (existingProducts.length === 0) {
      let searchGap = await SearchGap.findOne({ searchTerm: normalizedTerm });
      
      if (searchGap) {
        // Update existing search gap
        searchGap.searchCount += 1;
        searchGap.lastSearched = new Date();
        
        // Check if this user/guest already searched for this term
        let existingUserSearch = false;
        
        if (userId) {
          // For logged-in users, check by userId
          existingUserSearch = searchGap.searchedBy.find(
            search => search.userId && search.userId.toString() === userId
          );
        } else if (guestId) {
          // For guest users, check by guestId
          existingUserSearch = searchGap.searchedBy.find(
            search => search.guestId === guestId
          );
        }
        
        if (!existingUserSearch) {
          searchGap.userCount += 1;
          searchGap.searchedBy.push({
            userId: userId || null,
            guestId: guestId || null,
            searchedAt: new Date(),
            pincode: pincode || null
          });
        }
        
        await searchGap.save();
      } else {
        // Create new search gap
        searchGap = new SearchGap({
          searchTerm: normalizedTerm,
          searchCount: 1,
          userCount: 1,
          searchedBy: [{
            userId: userId || null,
            guestId: guestId || null,
            searchedAt: new Date(),
            pincode: pincode || null
          }]
        });
        
        await searchGap.save();
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking search gap:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get all search gaps for admin
exports.getSearchGaps = async (req, res) => {
  try {
    const { 
      search = '', 
      status = 'all', 
      priority = 'all',
      timeFilter = 'all',
      page = 1, 
      limit = 50 
    } = req.query;

    const query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { searchTerm: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { subcategory: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Status filter
    if (status !== 'all') {
      query.status = status;
    }
    
    // Priority filter
    if (priority !== 'all') {
      query.priority = priority;
    }
    
    // Time filter
    if (timeFilter !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (timeFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }
      
      if (startDate) {
        query.lastSearched = { $gte: startDate };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const searchGaps = await SearchGap.find(query)
      .sort({ searchCount: -1, lastSearched: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('searchedBy.userId', 'name phone');
    
    const total = await SearchGap.countDocuments(query);
    
    res.json({
      searchGaps,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching search gaps:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update search gap status/priority/notes
exports.updateSearchGap = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, notes, category, subcategory, estimatedDemand, estimatedValue } = req.body;
    
    const searchGap = await SearchGap.findById(id);
    if (!searchGap) {
      return res.status(404).json({ message: 'Search gap not found' });
    }
    
    if (status) searchGap.status = status;
    if (priority) searchGap.priority = priority;
    if (notes !== undefined) searchGap.notes = notes;
    if (category) searchGap.category = category;
    if (subcategory) searchGap.subcategory = subcategory;
    if (estimatedDemand !== undefined) searchGap.estimatedDemand = estimatedDemand;
    if (estimatedValue !== undefined) searchGap.estimatedValue = estimatedValue;
    
    await searchGap.save();
    
    res.json(searchGap);
  } catch (error) {
    console.error('Error updating search gap:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete search gap
exports.deleteSearchGap = async (req, res) => {
  try {
    const { id } = req.params;
    
    const searchGap = await SearchGap.findById(id);
    if (!searchGap) {
      return res.status(404).json({ message: 'Search gap not found' });
    }
    
    await SearchGap.findByIdAndDelete(id);
    
    res.json({ message: 'Search gap deleted successfully' });
  } catch (error) {
    console.error('Error deleting search gap:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get search gap statistics
exports.getSearchGapStats = async (req, res) => {
  try {
    const totalGaps = await SearchGap.countDocuments();
    const newGaps = await SearchGap.countDocuments({ status: 'new' });
    const investigatingGaps = await SearchGap.countDocuments({ status: 'investigating' });
    const plannedGaps = await SearchGap.countDocuments({ status: 'planned' });
    
    const totalSearches = await SearchGap.aggregate([
      { $group: { _id: null, total: { $sum: '$searchCount' } } }
    ]);
    
    res.json({
      totalGaps,
      newGaps,
      investigatingGaps,
      plannedGaps,
      totalSearches: totalSearches[0]?.total || 0
    });
  } catch (error) {
    console.error('Error fetching search gap stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};