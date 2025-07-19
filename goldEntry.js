
const express = require('express');
const router = express.Router();
const GoldEntry = require('./models/goldEntry');

// Delete a gold entry
router.delete('/:id', async (req, res) => {
  try {
    await GoldEntry.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete gold entry' });
  }
});

// Get all gold entries
router.get('/', async (req, res) => {
  try {
    const entries = await GoldEntry.find().sort({ purchaseDate: -1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch gold entries' });
  }
});

// Create or update a gold entry
router.post('/', async (req, res) => {
  const { _id, purchaseDate, grams, price, comments } = req.body;
  try {
    let entry;
    if (_id) {
      entry = await GoldEntry.findByIdAndUpdate(_id, { purchaseDate, grams, price, comments }, { new: true });
    } else {
      entry = new GoldEntry({ purchaseDate, grams, price, comments });
      await entry.save();
    }
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save gold entry' });
  }
});

module.exports = router;
