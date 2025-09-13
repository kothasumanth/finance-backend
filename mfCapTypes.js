const express = require('express');
const router = express.Router();
const MFCapTypes = require('./models/mfCapTypes');

// Get all cap types
router.get('/api/mfcaptypes', async (req, res) => {
    try {
        const capTypes = await MFCapTypes.find().sort({ name: 1 });
        res.json(capTypes);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create new cap type
router.post('/api/mfcaptypes', async (req, res) => {
    try {
        const capType = new MFCapTypes({
            name: req.body.name
        });
        const newCapType = await capType.save();
        res.status(201).json(newCapType);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update cap type
router.put('/api/mfcaptypes/:id', async (req, res) => {
    try {
        const capType = await MFCapTypes.findById(req.params.id);
        if (!capType) {
            return res.status(404).json({ message: 'Cap Type not found' });
        }
        capType.name = req.body.name;
        const updatedCapType = await capType.save();
        res.json(updatedCapType);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete cap type
router.delete('/api/mfcaptypes/:id', async (req, res) => {
    try {
        const capType = await MFCapTypes.findById(req.params.id);
        if (!capType) {
            return res.status(404).json({ message: 'Cap Type not found' });
        }
        await capType.remove();
        res.json({ message: 'Cap Type deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
