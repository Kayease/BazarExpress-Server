const Blog = require('../models/Blog');
const { deleteImageFromUrl } = require('../utils/cloudinary');

// Helper function to generate slug
function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}

// Get all published blogs (public endpoint)
exports.getPublishedBlogs = async (req, res) => {
    try {
        const { page = 1, limit = 10, category, search, featured } = req.query;
        
        let query = { status: 'published' };
        
        // Filter by category
        if (category && category !== 'All') {
            query.category = category;
        }
        
        // Filter by featured
        if (featured === 'true') {
            query.featured = true;
        }
        
        // Search functionality
        if (search) {
            query.$text = { $search: search };
        }
        
        const blogs = await Blog.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('-__v');
            
        const total = await Blog.countDocuments(query);
        
        res.json({
            blogs,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Get single blog by slug (public endpoint)
exports.getBlogBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        
        const blog = await Blog.findOne({ slug, status: 'published' });
        if (!blog) {
            return res.status(404).json({ error: 'Blog post not found' });
        }
        
        // Increment views
        blog.views += 1;
        await blog.save();
        
        res.json(blog);
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Get all blogs (admin only)
exports.getAllBlogs = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, category, search } = req.query;
        
        let query = {};
        
        // Filter by status
        if (status) {
            query.status = status;
        }
        
        // Filter by category
        if (category && category !== 'All') {
            query.category = category;
        }
        
        // Search functionality
        if (search) {
            query.$text = { $search: search };
        }
        
        const blogs = await Blog.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const total = await Blog.countDocuments(query);
        
        res.json({
            blogs,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Get single blog by ID (admin only)
exports.getBlogById = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) {
            return res.status(404).json({ error: 'Blog post not found' });
        }
        res.json(blog);
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Create new blog (admin only)
exports.createBlog = async (req, res) => {
    try {
        const { title, excerpt, content, author, category, image, readTime, status, featured, tags } = req.body;
        
        // Validation
        if (!title || !excerpt || !content || !category || !image) {
            return res.status(400).json({ error: 'Title, excerpt, content, category, and image are required' });
        }
        
        // Generate slug from title
        let slug = slugify(title);
        
        // Ensure slug uniqueness
        let uniqueSlug = slug;
        let counter = 1;
        while (await Blog.findOne({ slug: uniqueSlug })) {
            uniqueSlug = `${slug}-${counter}`;
            counter++;
        }
        
        const blog = new Blog({
            title,
            slug: uniqueSlug,
            excerpt,
            content,
            author: author || 'BazarXpress Team',
            category,
            image,
            readTime: readTime || '5 min read',
            status: status || 'draft',
            featured: featured || false,
            tags: tags || []
        });
        
        await blog.save();
        res.status(201).json(blog);
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Update blog (admin only)
exports.updateBlog = async (req, res) => {
    try {
        const { title, excerpt, content, author, category, image, readTime, status, featured, tags } = req.body;
        
        const updateData = {
            excerpt,
            content,
            author,
            category,
            image,
            readTime,
            status,
            featured,
            tags
        };
        
        // If title is provided, update slug
        if (title) {
            updateData.title = title;
            let slug = slugify(title);
            
            // Ensure slug uniqueness (excluding current blog)
            let uniqueSlug = slug;
            let counter = 1;
            while (await Blog.findOne({ slug: uniqueSlug, _id: { $ne: req.params.id } })) {
                uniqueSlug = `${slug}-${counter}`;
                counter++;
            }
            updateData.slug = uniqueSlug;
        }
        
        const blog = await Blog.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!blog) {
            return res.status(404).json({ error: 'Blog post not found' });
        }
        
        res.json(blog);
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Delete blog (admin only)
exports.deleteBlog = async (req, res) => {
    try {
        // First, get the blog to access its image URL
        const blog = await Blog.findById(req.params.id);
        if (!blog) {
            return res.status(404).json({ error: 'Blog post not found' });
        }
        
        // Delete the image from Cloudinary first
        if (blog.image) {
            const imageDeleteResult = await deleteImageFromUrl(blog.image);
            if (imageDeleteResult.result !== 'ok' && imageDeleteResult.result !== 'not found') {
                return res.status(500).json({ error: 'Failed to delete image from Cloudinary', details: imageDeleteResult });
            }
        }
        
        // Then delete the blog from database
        await Blog.findByIdAndDelete(req.params.id);
        res.json({ message: 'Blog post deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Get blog statistics (admin only)
exports.getBlogStats = async (req, res) => {
    try {
        const total = await Blog.countDocuments();
        const published = await Blog.countDocuments({ status: 'published' });
        const drafts = await Blog.countDocuments({ status: 'draft' });
        const featured = await Blog.countDocuments({ featured: true });
        
        // Get category distribution
        const categoryStats = await Blog.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        // Get most viewed blogs
        const mostViewed = await Blog.find({ status: 'published' })
            .sort({ views: -1 })
            .limit(5)
            .select('title views');
        
        res.json({
            total,
            published,
            drafts,
            featured,
            categoryStats,
            mostViewed
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Get blog categories (public endpoint)
exports.getBlogCategories = async (req, res) => {
    try {
        const categories = await Blog.distinct('category', { status: 'published' });
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Like/Unlike blog (public endpoint)
exports.toggleLike = async (req, res) => {
    try {
        const { slug } = req.params;
        
        const blog = await Blog.findOne({ slug, status: 'published' });
        if (!blog) {
            return res.status(404).json({ error: 'Blog post not found' });
        }
        
        // For now, just increment likes (in a real app, you'd track user likes)
        blog.likes += 1;
        await blog.save();
        
        res.json({ likes: blog.likes });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
}; 