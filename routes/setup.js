const express = require('express');
const router = express.Router();

// Basic setup endpoints can be added here
router.get('/', (req, res) => {
    res.json({ message: 'Setup route is working' });
});

module.exports = router;
