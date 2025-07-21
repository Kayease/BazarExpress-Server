const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true,
        trim: true
    },
    slug: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true
    },
    excerpt: { 
        type: String, 
        required: true,
        trim: true
    },
    content: { 
        type: String, 
        required: true 
    },
    author: { 
        type: String, 
        required: true,
        default: 'BazarXpress Team'
    },
    category: { 
        type: String, 
        required: true,
        enum: ['Technology', 'Health & Nutrition', 'Sustainability', 'Company News', 'Lifestyle', 'Recipes']
    },
    image: { 
        type: String, 
        required: true 
    },
    readTime: { 
        type: String, 
        default: '5 min read'
    },
    status: { 
        type: String, 
        enum: ['draft', 'published'], 
        default: 'draft' 
    },
    featured: { 
        type: Boolean, 
        default: false 
    },
    tags: [{ 
        type: String 
    }],
    views: { 
        type: Number, 
        default: 0 
    },
    likes: { 
        type: Number, 
        default: 0 
    }
}, { 
    timestamps: true 
});

// Create index for better search performance
blogSchema.index({ title: 'text', excerpt: 'text', content: 'text' });

module.exports = mongoose.model('Blog', blogSchema); 