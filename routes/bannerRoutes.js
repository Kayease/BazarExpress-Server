const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const { isAuth, hasPermission, canAccessSection } = require('../middleware/authMiddleware');

// Public routes
router.get('/', bannerController.getBanners);
router.get('/special', bannerController.getSpecialBanners);

// Admin: Get banner statistics (must be before '/:id')
router.get('/stats', 
    isAuth, 
    hasPermission(['admin', 'marketing_content_manager']),
    canAccessSection('banners'),
    bannerController.getBannerStats
);

// Public: Get banner by id (kept after '/stats' to avoid collision)
router.get('/:id', bannerController.getBanner);

// Admin routes with role-based access
router.post('/', 
    isAuth, 
    hasPermission(['admin', 'marketing_content_manager']),
    canAccessSection('banners'),
    bannerController.createBanner
);

router.put('/:id', 
    isAuth, 
    hasPermission(['admin', 'marketing_content_manager']),
    canAccessSection('banners'),
    bannerController.updateBanner
);

router.post('/delete-image', 
    isAuth, 
    hasPermission(['admin', 'marketing_content_manager']),
    canAccessSection('banners'),
    bannerController.deleteBannerImage
);

router.delete('/:id', 
    isAuth, 
    hasPermission(['admin', 'marketing_content_manager']),
    canAccessSection('banners'),
    bannerController.deleteBanner
);

module.exports = router;