const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');

router.get('/', bannerController.getBanners);
router.get('/special', bannerController.getSpecialBanners);
router.get('/:id', bannerController.getBanner);
router.post('/', bannerController.createBanner);
router.put('/:id', bannerController.updateBanner);
router.post('/delete-image', bannerController.deleteBannerImage);
router.delete('/:id', bannerController.deleteBanner);

module.exports = router;