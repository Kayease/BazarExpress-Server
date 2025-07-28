const { deleteImageFromUrl } = require('../utils/cloudinary');
const Brand = require('../models/Brand');

exports.deleteBrandImage = async(req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) return res.status(400).json({ error: 'Missing imageUrl' });
        const result = await deleteImageFromUrl(imageUrl);
        if (result.result !== 'ok' && result.result !== 'not found') {
            return res.status(500).json({ error: 'Failed to delete image', details: result });
        }
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Paginated and searchable brands endpoint
exports.getBrandsPaginated = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const query = search
      ? { name: { $regex: search, $options: 'i' } }
      : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let items, total;
    try {
      items = await Brand.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(parseInt(limit));
      total = await Brand.countDocuments(query);
    } catch (err) {
      console.error('Brand query error:', err);
      throw err;
    }
    const totalPages = Math.ceil(total / parseInt(limit));
    res.json({ items, totalPages });
  } catch (err) {
    console.error('getBrandsPaginated error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};