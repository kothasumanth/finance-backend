const mongoose = require('mongoose');

const mutualFundEntrySchema = new mongoose.Schema({
  fundName: { type: mongoose.Schema.Types.ObjectId, ref: 'MutualFundMetadata', required: true },
  date: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

module.exports = mongoose.model('MutualFundEntry', mutualFundEntrySchema);
