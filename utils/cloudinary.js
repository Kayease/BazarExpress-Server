const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

function getPublicIdFromUrl(url) {
    try {
        const parts = url.split('/');
        const uploadIndex = parts.findIndex(p => p === 'upload');
        if (uploadIndex === -1) return null;
        
        // Get everything after 'upload/'
        let publicIdParts = parts.slice(uploadIndex + 1);
        
        // Remove version number if present (starts with 'v' followed by numbers)
        if (publicIdParts[0] && publicIdParts[0].startsWith('v') && !isNaN(Number(publicIdParts[0].slice(1)))) {
            publicIdParts = publicIdParts.slice(1);
        }
        
        const publicIdWithExt = publicIdParts.join('/');
        return publicIdWithExt.replace(/\.[^/.]+$/, '');
    } catch {
        return null;
    }
}

async function deleteImageFromUrl(imageUrl) {
    if (!imageUrl) {
        return { result: 'not found' };
    }
    const public_id = getPublicIdFromUrl(imageUrl);
    if (!public_id) {
        return { result: 'invalid' };
    }
    try {
        const result = await cloudinary.uploader.destroy(public_id);
        return result;
    } catch (error) {
        return { result: 'error', error: error.message };
    }
}

module.exports = { deleteImageFromUrl };