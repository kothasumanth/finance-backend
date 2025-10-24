const express = require('express');
const router = express.Router();
const SIPInfo = require('./models/sipInfo');
const MutualFundMetadata = require('./models/mutualFundMetadata');

// Get SIP Info for a user
router.get('/sip-info/:userId', async (req, res) => {
    try {
        const sipInfo = await SIPInfo.find({ userId: req.params.userId })
            .populate('mfMetadataId', 'MutualFundName');
        res.json(sipInfo);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create new SIP Info
router.post('/sip-info', async (req, res) => {
    const sipInfo = new SIPInfo({
        mfMetadataId: req.body.mfMetadataId,
        userId: req.body.userId,
        frequency: req.body.frequency,
        amount: req.body.amount
    });

    try {
        const newSipInfo = await sipInfo.save();
        const populatedSipInfo = await SIPInfo.findById(newSipInfo._id)
            .populate('mfMetadataId', 'MutualFundName');
        res.status(201).json(populatedSipInfo);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update SIP Info
router.put('/sip-info/:id', async (req, res) => {
    try {
        const sipInfo = await SIPInfo.findById(req.params.id);
        if (!sipInfo) {
            return res.status(404).json({ message: 'SIP Info not found' });
        }

        if (req.body.mfMetadataId) sipInfo.mfMetadataId = req.body.mfMetadataId;
        if (req.body.frequency) sipInfo.frequency = req.body.frequency;
        if (req.body.amount) sipInfo.amount = req.body.amount;

        const updatedSipInfo = await sipInfo.save();
        const populatedSipInfo = await SIPInfo.findById(updatedSipInfo._id)
            .populate('mfMetadataId', 'MutualFundName');
        res.json(populatedSipInfo);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete SIP Info
router.delete('/sip-info/:id', async (req, res) => {
    try {
        const sipInfo = await SIPInfo.findById(req.params.id);
        if (!sipInfo) {
            return res.status(404).json({ message: 'SIP Info not found' });
        }
        await SIPInfo.deleteOne({ _id: req.params.id });
        res.json({ message: 'SIP Info deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;