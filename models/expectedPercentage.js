const mongoose = require('mongoose');

const expectedPercentageSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    capTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MFCapType',
        required: true
    },
    // capTotal represents the total expected percentage for this cap type
    capTotal: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    // splitDetails represents the Active/Passive split within this cap type
    splitDetails: {
        activePercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        passivePercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        }
    }
}, {
    timestamps: true
});

// Create a compound unique index on userId and capTypeId
expectedPercentageSchema.index({ userId: 1, capTypeId: 1 }, { unique: true });

// Add validation to ensure split percentages sum to 100
expectedPercentageSchema.pre('save', function(next) {
    const totalSplit = this.splitDetails.activePercentage + this.splitDetails.passivePercentage;
    if (Math.abs(totalSplit - 100) > 0.01) {
        next(new Error('Active and Passive percentages must sum to 100%'));
    }
    next();
});

module.exports = mongoose.model('ExpectedPercentage', expectedPercentageSchema);
