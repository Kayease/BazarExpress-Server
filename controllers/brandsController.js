const { deleteImageFromUrl } = require('../utils/cloudinary');

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