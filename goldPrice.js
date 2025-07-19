const express = require('express');
const router = express.Router();
const GoldPrice = require('./models/goldPrice');

// Get latest gold price
router.get('/', async (req, res) => {
  try {
    const latest = await GoldPrice.findOne().sort({ date: -1 });
    res.json(latest ? latest.price : null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new gold price
router.post('/', async (req, res) => {
  try {
    const { price } = req.body;
    if (typeof price !== 'number') return res.status(400).json({ error: 'Invalid price' });
    const entry = new GoldPrice({ price });
    await entry.save();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
