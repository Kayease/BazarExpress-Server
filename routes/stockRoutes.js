const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { addClient } = require('../utils/stockEvents');

// SSE stream for stock updates
router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders?.();

  // initial ping to establish
  res.write('event: ping\n');
  res.write('data: {}\n\n');

  addClient(res);

  // heartbeat
  const interval = setInterval(() => {
    try {
      res.write('event: ping\n');
      res.write('data: {}\n\n');
    } catch {
      clearInterval(interval);
      try { res.end(); } catch {}
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(interval);
    try { res.end(); } catch {}
  });
});

// REST endpoint to fetch current availability
router.get('/availability/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const variants = product.variants || {};
    const variantStocks = {};
    Object.keys(variants).forEach(k => {
      const v = variants[k] || {};
      variantStocks[k] = Number(v.stock) || 0;
    });

    return res.json({
      productId: product._id.toString(),
      stock: Number(product.stock) || 0,
      variantStocks,
    });
  } catch (e) {
    console.error('availability error', e);
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
});

module.exports = router;