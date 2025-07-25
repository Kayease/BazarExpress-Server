const Category = require('../models/Category');
const cloudinary = require('cloudinary').v2;
const Product = require('../models/Product');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadThumbnailToCloudinary(base64, folder) {
    if (!base64) return '';
    try {
        const res = await cloudinary.uploader.upload(base64, {
            folder: `categories/${folder}`,
            resource_type: 'image',
        });
        return res.secure_url;
    } catch (err) {
        return '';
    }
}

// Helper function to delete image from Cloudinary
async function deleteImageFromCloudinary(imageUrl) {
    if (!imageUrl) return;
    try {
        // Extract public_id from Cloudinary URL
        const urlParts = imageUrl.split('/');
        const uploadIndex = urlParts.findIndex(part => part === 'upload');
        if (uploadIndex === -1) return;
        
        const publicIdWithExtension = urlParts.slice(uploadIndex + 2).join('/');
        const publicId = publicIdWithExtension.split('.')[0]; // Remove file extension
        
        await cloudinary.uploader.destroy(publicId);
    } catch (err) {
        console.error('Error deleting image from Cloudinary:', err);
    }
}

// Get all categories
async function getCategories(req, res) {
    try {
        const categories = await Category.find().sort({ sortOrder: 1, name: 1 });
        // Count products for each category
        const categoriesWithCount = await Promise.all(categories.map(async (cat) => {
            const count = await Product.countDocuments({ category: cat._id });
            return { ...cat.toObject(), productCount: count };
        }));
        res.json(categoriesWithCount);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
}

// Create a new category
async function createCategory(req, res) {
    try {
        let { name, parentId = '', hide = false, popular = false, icon = 'Box', description = '', sortOrder = 0, slug = '', thumbnail = '', showOnHome = false } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        // Check for unique sortOrder
        const existingSortOrder = await Category.findOne({ sortOrder });
        if (existingSortOrder) {
            return res.status(400).json({ error: 'Sort order must be unique. Another category already has this value.' });
        }
        if (thumbnail && thumbnail.startsWith('data:')) {
            thumbnail = await uploadThumbnailToCloudinary(thumbnail, slug || name);
        }
        const category = await Category.create({ name, parentId, hide, popular, icon, description, sortOrder, slug, thumbnail, showOnHome });
        res.status(201).json(category);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create category' });
    }
}

// Update a category
async function updateCategory(req, res) {
    try {
        const { id } = req.params;
        let { name, parentId = '', hide = false, popular = false, icon = 'Box', description = '', sortOrder = 0, slug = '', thumbnail = '', showOnHome = false } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        // Check for unique sortOrder (exclude self)
        const existingSortOrder = await Category.findOne({ sortOrder, _id: { $ne: id } });
        if (existingSortOrder) {
            return res.status(400).json({ error: 'Sort order must be unique. Another category already has this value.' });
        }
        // Get the existing category to check if we need to delete old thumbnail
        const existingCategory = await Category.findById(id);
        
        if (thumbnail && thumbnail.startsWith('data:')) {
            // Delete old thumbnail if it exists
            if (existingCategory && existingCategory.thumbnail) {
                await deleteImageFromCloudinary(existingCategory.thumbnail);
            }
            thumbnail = await uploadThumbnailToCloudinary(thumbnail, slug || name);
        }
        
        const updated = await Category.findByIdAndUpdate(id, { name, parentId, hide, popular, icon, description, sortOrder, slug, thumbnail, showOnHome }, { new: true });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update category' });
    }
}

// Delete a category
async function deleteCategory(req, res) {
    try {
        const { id } = req.params;
        // Check if any product exists under this category
        const productCount = await Product.countDocuments({ category: id });
        if (productCount > 0) {
            return res.status(400).json({ error: "Cannot delete category: Products exist under this category." });
        }
        // Get the category first to access its thumbnail
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        // Delete thumbnail from Cloudinary if it exists
        if (category.thumbnail) {
            await deleteImageFromCloudinary(category.thumbnail);
        }
        // Delete the category from database
        await Category.findByIdAndDelete(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
}

// Get subcategories by parent ID
async function getSubcategoriesByParent(req, res) {
    try {
        const { parentId } = req.params;
        if (!parentId) {
            return res.status(400).json({ error: 'Parent ID is required' });
        }
        
        const subcategories = await Category.find({ parentId }).sort({ sortOrder: 1, name: 1 });
        
        // Count products for each subcategory
        const subcategoriesWithCount = await Promise.all(subcategories.map(async (subcat) => {
            const count = await Product.countDocuments({ subcategory: subcat._id });
            return { ...subcat.toObject(), productCount: count };
        }));
        
        res.json(subcategoriesWithCount);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch subcategories' });
    }
}

// Paginated and searchable categories endpoint
async function getCategoriesPaginated(req, res) {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const baseParentFilter = { $or: [{ parentId: { $exists: false } }, { parentId: '' }, { parentId: null }] };
    const query = search
      ? { ...baseParentFilter, name: { $regex: search, $options: 'i' } }
      : baseParentFilter;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [items, total] = await Promise.all([
      Category.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Category.countDocuments(query)
    ]);
    const totalPages = Math.ceil(total / limit);
    res.json({ items, totalPages });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getSubcategoriesByParent,
    getCategoriesPaginated
};