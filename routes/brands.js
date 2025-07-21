const express = require("express");
const router = express.Router();
const Brand = require("../models/Brand");
const brandsController = require('../controllers/brandsController');
const Product = require("../models/Product");

// Helper to generate slug
function slugify(str) {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/--+/g, "-");
}

// POST /brands
router.post("/", async(req, res) => {
    try {
        const {
            name,
            slug,
            description,
            logo,
            bannerImage,
            isPopular,
            showOnHome,
            status,
        } = req.body;
        if (!name || !logo)
            return res.status(400).json({ error: "Name and logo are required." });
        let brandSlug = slug || slugify(name);
        // Ensure slug uniqueness
        let uniqueSlug = brandSlug;
        let i = 1;
        while (await Brand.findOne({ slug: uniqueSlug })) {
            uniqueSlug = `${brandSlug}-${i++}`;
        }
        const brand = new Brand({
            name,
            slug: uniqueSlug,
            description,
            logo,
            bannerImage,
            isPopular,
            showOnHome,
            status,
        });
        await brand.save();
        res.status(201).json(brand);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// GET /brands
router.get("/", async(req, res) => {
    try {
        const brands = await Brand.find();
        // Count products for each brand
        const brandsWithCount = await Promise.all(brands.map(async (brand) => {
            const count = await Product.countDocuments({ brand: brand._id });
            return { ...brand.toObject(), productCount: count };
        }));
        res.json(brandsWithCount);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// GET /brands/:id
router.get("/:id", async(req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) return res.status(404).json({ error: "Brand not found" });
        res.json(brand);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// PUT /brands/:id
router.put("/:id", async(req, res) => {
    try {
        const {
            name,
            slug,
            description,
            logo,
            bannerImage,
            isPopular,
            showOnHome,
            status,
        } = req.body;
        let update = {
            name,
            description,
            logo,
            bannerImage,
            isPopular,
            showOnHome,
            status,
        };
        // Regenerate slug if name changes and no slug provided
        if (slug) {
            update.slug = slug;
        } else if (name) {
            let brandSlug = slugify(name);
            let uniqueSlug = brandSlug;
            let i = 1;
            while (
                await Brand.findOne({ slug: uniqueSlug, _id: { $ne: req.params.id } })
            ) {
                uniqueSlug = `${brandSlug}-${i++}`;
            }
            update.slug = uniqueSlug;
        }
        const brand = await Brand.findByIdAndUpdate(req.params.id, update, {
            new: true,
        });
        if (!brand) return res.status(404).json({ error: "Brand not found" });
        res.json(brand);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// DELETE /brands/:id
router.delete("/:id", async(req, res) => {
    try {
        // Check if any product exists under this brand
        const productCount = await Product.countDocuments({ brand: req.params.id });
        if (productCount > 0) {
            return res.status(400).json({ error: "Cannot delete brand: Products exist under this brand." });
        }
        const brand = await Brand.findByIdAndDelete(req.params.id);
        if (!brand) return res.status(404).json({ error: "Brand not found" });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

router.post('/delete-image', brandsController.deleteBrandImage);

module.exports = router;