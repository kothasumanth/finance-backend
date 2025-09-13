const router = require('express').Router();
const ExpectedPercentage = require('../models/expectedPercentage');

// Get expected percentages for a user
router.get('/:userId', async (req, res) => {
    try {
        // Get all mutual fund entries for the user
        const MutualFundEntry = require('../models/mutualFundEntry');
        const MutualFundMetadata = require('../models/mutualFundMetadata');

        // First get all fund entries for this user
        const userEntries = await MutualFundEntry.find({ userId: req.params.userId })
            .populate({
                path: 'fundName',
                model: 'MutualFundMetadata'
            });

        // Get unique cap type IDs from user's actual investments
        const activeCapTypeIds = [...new Set(
            userEntries
                .map(entry => entry.fundName.CapType)
                .filter(Boolean)
        )];

        // Get expected percentages but only keep those that match active cap types
        const allExpectedPercentages = await ExpectedPercentage.find({
            userId: req.params.userId
        });

        // Filter out percentages for cap types where user has no investments
        const activeExpectedPercentages = allExpectedPercentages.filter(ep => 
            activeCapTypeIds.includes(ep.capTypeId.toString())
        );

        // If we filtered out any entries, clean up the database
        if (activeExpectedPercentages.length !== allExpectedPercentages.length) {
            // Delete all existing entries
            await ExpectedPercentage.deleteMany({ userId: req.params.userId });
            
            // Only if we have active percentages, reinsert them
            if (activeExpectedPercentages.length > 0) {
                await ExpectedPercentage.insertMany(activeExpectedPercentages);
            }
        }

        res.json(activeExpectedPercentages);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Save or update expected percentages for a user
router.post('/:userId', async (req, res) => {
    try {
        const { percentages } = req.body;
        const userId = req.params.userId;

        // Validate that total cap type percentages equal 100%
        const totalCapPercentage = percentages.reduce((sum, p) => sum + p.capTotal, 0);
        if (Math.abs(totalCapPercentage - 100) > 0.01) {
            return res.status(400).json({
                message: 'Total percentages across all cap types must equal 100%'
            });
        }

        // Delete existing entries for this user
        await ExpectedPercentage.deleteMany({ userId });

        // Create new entries
        const entries = percentages.map(p => ({
            userId,
            capTypeId: p.capTypeId,
            capTotal: p.capTotal,
            splitDetails: {
                activePercentage: p.activePercentage,
                passivePercentage: p.passivePercentage
            }
        }));

        await ExpectedPercentage.insertMany(entries);

        res.status(201).json({ message: 'Expected percentages saved successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
