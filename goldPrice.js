const express = require('express');
const router = express.Router();
const GoldPrice = require('./models/goldPrice');

// Get latest gold price
router.get('/', async (req, res) => {
  try {
    const latest = await GoldPrice.findOne().sort({ date: -1 });
    if (!latest) {
      return res.json({ price24k: 1, price22k: 1, price18k: 1, date: null });
    }
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new gold price
router.post('/', async (req, res) => {
  try {
    const price24k = Number(req.body.price24k) || 1;
    const price22k = Number(req.body.price22k) || 1;
    const price18k = Number(req.body.price18k) || 1;
    const entry = new GoldPrice({ price24k, price22k, price18k });
    await entry.save();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
