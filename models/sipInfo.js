const mongoose = require('mongoose');

const sipInfoSchema = new mongoose.Schema({
    mfMetadataId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MutualFundMetadata',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    frequency: {
        type: String,
        enum: ['Daily', 'Weekly', 'BiWeekly', 'Monthly'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('SIPInfo', sipInfoSchema);