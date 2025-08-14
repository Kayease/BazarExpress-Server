const Banner = require('../models/Banner');
const { deleteImageFromUrl } = require('../utils/cloudinary');

exports.getBanners = async(req, res) => {
    try {
        const banners = await Banner.find().sort({ createdAt: -1 }).populate('categoryId');
        res.json(banners);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

exports.getBanner = async(req, res) => {
    try {
        const banner = await Banner.findById(req.params.id).populate('categoryId');
        if (!banner) return res.status(404).json({ error: 'Banner not found' });
        res.json(banner);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

exports.createBanner = async(req, res) => {
    try {
        const { image, name, active, categoryId, bannerType } = req.body;
        if (!image || !name) return res.status(400).json({ error: 'Image and name are required' });
        
        // Create banner with categoryId (might be undefined/null)
        const bannerData = { 
            image, 
            name, 
            active, 
            bannerType
        };
        
        // Only add categoryId if it's provided and not empty
        if (categoryId) {
            bannerData.categoryId = categoryId;
        }
        
        const banner = new Banner(bannerData);
        await banner.save();
        
        // Populate category before sending response
        const populatedBanner = await Banner.findById(banner._id).populate('categoryId');
        res.status(201).json(populatedBanner);
    } catch (err) {
        console.error('Error creating banner:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.updateBanner = async(req, res) => {
    try {
        const { image, name, active, categoryId, bannerType } = req.body;
        
        // Create update object
        const updateData = { 
            image, 
            name, 
            active, 
            bannerType
        };
        
        // Only add categoryId if it's provided and not empty
        if (categoryId) {
            updateData.categoryId = categoryId;
        } else {
            // If categoryId is empty, set it to null to remove the reference
            updateData.categoryId = null;
        }
        
        const banner = await Banner.findByIdAndUpdate(
            req.params.id, 
            updateData, 
            { new: true }
        ).populate('categoryId');
        
        if (!banner) return res.status(404).json({ error: 'Banner not found' });
        res.json(banner);
    } catch (err) {
        console.error('Error updating banner:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.getSpecialBanners = async(req, res) => {
    try {
        const specialBanners = {
            banner1: await Banner.findOne({ bannerType: 'banner1', active: true }).populate('categoryId'),
            banner2: await Banner.findOne({ bannerType: 'banner2', active: true }).populate('categoryId'),
            banner3: await Banner.findOne({ bannerType: 'banner3', active: true }).populate('categoryId')
        };
        res.json(specialBanners);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Get banner statistics
exports.getBannerStats = async(req, res) => {
    try {
        // Get all banners
        const allBanners = await Banner.find();
        
        // Calculate stats
        const stats = {
            total: allBanners.length,
            active: allBanners.filter(banner => banner.active === true).length,
            inactive: allBanners.filter(banner => banner.active === false).length,
            regular: allBanners.filter(banner => !banner.bannerType || banner.bannerType === 'regular').length,
            special: allBanners.filter(banner => banner.bannerType && banner.bannerType !== 'regular').length,
            banner1: allBanners.filter(banner => banner.bannerType === 'banner1').length,
            banner2: allBanners.filter(banner => banner.bannerType === 'banner2').length,
            banner3: allBanners.filter(banner => banner.bannerType === 'banner3').length
        };
        
        res.json({ stats });
    } catch (err) {
        console.error('Error getting banner stats:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.deleteBannerImage = async(req, res) => {
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

exports.deleteBanner = async(req, res) => {
    try {
        // First, get the banner to access its image URL
        const banner = await Banner.findById(req.params.id);
        if (!banner) {
            return res.status(404).json({ error: 'Banner not found' });
        }
        
        // Delete the image from Cloudinary first
        if (banner.image) {
            const imageDeleteResult = await deleteImageFromUrl(banner.image);
            if (imageDeleteResult.result !== 'ok' && imageDeleteResult.result !== 'not found') {
                return res.status(500).json({ error: 'Failed to delete image from Cloudinary', details: imageDeleteResult });
            }
        }
        
        // Then delete the banner from database
        await Banner.findByIdAndDelete(req.params.id);
        res.json({ message: 'Banner deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};