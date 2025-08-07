const Product = require('../models/Product');
const cloudinary = require('cloudinary').v2;
const Category = require('../models/Category');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadProductImageToCloudinary(base64, categorySlug, productSku) {
    if (!base64) return '';
    try {
        const res = await cloudinary.uploader.upload(base64, {
            folder: `products/${categorySlug}/${productSku}`,
            resource_type: 'image',
        });
        return res.secure_url;
    } catch (err) {
        return '';
    }
}

// Helper: get all product fields with defaults
function getProductFields(body) {
  return {
    name: body.name || "",
    price: body.price ?? 0,
    unit: body.unit || "",
    image: body.image || "",
    rating: body.rating ?? 0,
    deliveryTime: body.deliveryTime || "",
    description: body.description || "",
    brand: body.brand || null,
    category: body.category || null,
    subcategory: body.subcategory || null,
    warehouse: body.warehouse || null,
    tax: body.tax || null,
    stock: body.stock ?? 0,
    status: body.status || "active",
    sku: body.sku || "",
    hsn: body.hsn || "",
    costPrice: body.costPrice ?? 0,
    priceIncludesTax: body.priceIncludesTax ?? false,
    allowBackorders: body.allowBackorders ?? false,
    lowStockThreshold: body.lowStockThreshold ?? 0,
    weight: body.weight ?? 0,
    dimensions: body.dimensions || { l: "", w: "", h: "" },
    shippingClass: body.shippingClass || "",
    returnable: body.returnable ?? false,
    returnWindow: body.returnWindow ?? 0,
    codAvailable: body.codAvailable ?? false,
    mainImage: body.mainImage || "",
    galleryImages: body.galleryImages || [],
    video: body.video || "",
    model3d: body.model3d || "",
    metaTitle: body.metaTitle || "",
    metaDescription: body.metaDescription || "",
    metaKeywords: body.metaKeywords || "",
    canonicalUrl: body.canonicalUrl || "",
    legal_hsn: body.legal_hsn || "",
    batchNumber: body.batchNumber || "",
    manufacturer: body.manufacturer || "",
    warranty: body.warranty || "",
    certifications: body.certifications || "",
    safetyInfo: body.safetyInfo || "",
    mrp: Number(body.mrp) || 0,
    variants: body.variants || {},
    attributes: body.attributes || [],
  };
}

// Improved helper to extract public_id from Cloudinary URL
function extractPublicIdFromUrl(url) {
  if (!url) return null;
  // Match /upload/v123456789/products/abc/filename.jpg
  const match = url.match(/\/upload\/v\d+\/(.+)\.[a-zA-Z0-9]+$/);
  const publicId = match ? match[1] : null;
  // Extract public_id from Cloudinary URL
  return publicId;
}

exports.createProduct = async(req, res) => {
    try {
        // Process received product data
        let { image, category, sku, warehouse } = req.body;
        
        // For product_inventory_management role, restrict to assigned warehouses
        if (req.user.role === 'product_inventory_management') {
            if (!req.assignedWarehouseIds || req.assignedWarehouseIds.length === 0) {
                return res.status(403).json({ error: 'No warehouses assigned to this user' });
            }
            
            // Ensure the warehouse is one of the assigned warehouses
            if (!req.assignedWarehouseIds.includes(warehouse)) {
                return res.status(403).json({ error: 'Cannot create product in unassigned warehouse' });
            }
        }
        
        let imageUrl = image;
        // Get category slug for folder structure
        let categorySlug = '';
        if (category) {
            const cat = await Category.findById(category);
            if (cat) categorySlug = cat.slug || cat.name;
        }
        if (image && image.startsWith('data:')) {
            imageUrl = await uploadProductImageToCloudinary(image, categorySlug, sku || 'no-sku');
        }
        
        const productFields = getProductFields({ ...req.body, image: imageUrl });
        
        // Add creator information for tracking
        productFields.createdBy = req.user._id;
        
        const product = await Product.create(productFields);
        res.status(201).json(product);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get all products with optional filtering
exports.getProducts = async (req, res) => {
    try {
        const { category, subcategory } = req.query;
        let query = {};
        
        // For product_inventory_management role, filter by assigned warehouses
        if (req.user && req.user.role === 'product_inventory_management' && req.assignedWarehouseIds) {
            query.warehouse = { $in: req.assignedWarehouseIds };
        }
        
        // Add category filter if provided
        if (category) {
            query.category = category;
        }
        
        // Add subcategory filter if provided
        if (subcategory) {
            query.subcategory = subcategory;
        }

        const products = await Product.find(query)
            .populate('category')
            .populate('subcategory')
            .populate('brand')
            .populate('warehouse')
            .populate('tax')
            .populate('createdBy', 'name email');

        res.json(products);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Paginated and searchable products endpoint
exports.getProductsPaginated = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 20 } = req.query;
        const query = {};
        
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }
        
        // For product_inventory_management role, filter by assigned warehouses
        if (req.user && req.user.role === 'product_inventory_management' && req.assignedWarehouseIds) {
            query.warehouse = { $in: req.assignedWarehouseIds };
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const products = await Product.find(query)
            .populate('brand')
            .populate('category')
            .populate('warehouse')
            .populate('tax')
            .skip(skip)
            .limit(parseInt(limit));
        const total = await Product.countDocuments(query);
        res.json({
            products,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getProductById = async(req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('brand')
            .populate('category')
            .populate('subcategory')
            .populate('warehouse')
            .populate('tax');
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateProduct = async(req, res) => {
    try {
        // First, find the existing product to check warehouse access
        const existingProduct = await Product.findById(req.params.id);
        if (!existingProduct) return res.status(404).json({ error: 'Product not found' });
        
        // For product_inventory_management role, check warehouse access
        if (req.user.role === 'product_inventory_management') {
            if (!req.assignedWarehouseIds || req.assignedWarehouseIds.length === 0) {
                return res.status(403).json({ error: 'No warehouses assigned to this user' });
            }
            
            // Check if the existing product's warehouse is in assigned warehouses
            if (!req.assignedWarehouseIds.includes(existingProduct.warehouse.toString())) {
                return res.status(403).json({ error: 'Cannot edit product from unassigned warehouse' });
            }
            
            // If warehouse is being changed, ensure new warehouse is also assigned
            if (req.body.warehouse && !req.assignedWarehouseIds.includes(req.body.warehouse)) {
                return res.status(403).json({ error: 'Cannot move product to unassigned warehouse' });
            }
        }
        
        const productFields = getProductFields(req.body);
        const product = await Product.findByIdAndUpdate(req.params.id, productFields, { new: true });
        res.json(product);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.deleteProduct = async(req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        
        // For product_inventory_management role, check warehouse access
        if (req.user.role === 'product_inventory_management') {
            if (!req.assignedWarehouseIds || req.assignedWarehouseIds.length === 0) {
                return res.status(403).json({ error: 'No warehouses assigned to this user' });
            }
            
            // Check if the product's warehouse is in assigned warehouses
            if (!req.assignedWarehouseIds.includes(product.warehouse.toString())) {
                return res.status(403).json({ error: 'Cannot delete product from unassigned warehouse' });
            }
        }
        // Delete main image
        let mainImagePublicId = product.image && product.image.public_id ? product.image.public_id : extractPublicIdFromUrl(product.image);
        if (mainImagePublicId) {
            const result = await cloudinary.uploader.destroy(mainImagePublicId);
            // Delete main image from Cloudinary
        }
        // Delete gallery images
        if (Array.isArray(product.galleryImages)) {
            for (const img of product.galleryImages) {
                let publicId = img && img.public_id ? img.public_id : extractPublicIdFromUrl(img);
                if (publicId) {
                    const result = await cloudinary.uploader.destroy(publicId);
                    console.log('Deleting from Cloudinary:', publicId, 'Result:', result);
                }
            }
        }
        // Delete variant images (support images array and legacy single image)
        if (product.variants && typeof product.variants === 'object') {
            for (const key of Object.keys(product.variants)) {
                const variant = product.variants[key];
                // If using images array
                if (variant && Array.isArray(variant.images)) {
                    for (const vimg of variant.images) {
                        let publicId = vimg && vimg.public_id ? vimg.public_id : extractPublicIdFromUrl(vimg);
                        if (publicId) {
                            const result = await cloudinary.uploader.destroy(publicId);
                            console.log('Deleting from Cloudinary:', publicId, 'Result:', result);
                        }
                    }
                }
                // If legacy single image
                if (variant && variant.image) {
                    let publicId = variant.image.public_id ? variant.image.public_id : extractPublicIdFromUrl(variant.image);
                    if (publicId) {
                        const result = await cloudinary.uploader.destroy(publicId);
                        console.log('Deleting from Cloudinary:', publicId, 'Result:', result);
                    }
                }
            }
        }
        // Now delete the product
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Product and images deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteImageByPublicId = async (req, res) => {
  try {
    const { public_id } = req.body;
    if (!public_id) return res.status(400).json({ error: 'Missing public_id' });
    const result = await cloudinary.uploader.destroy(public_id);
    if (result.result !== 'ok' && result.result !== 'not found') {
      return res.status(500).json({ error: 'Failed to delete image', details: result });
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
};