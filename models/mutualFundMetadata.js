const mongoose = require('mongoose');

const mutualFundMetadataSchema = new mongoose.Schema({
  MutualFundName: { type: String, required: true },
  GoogleValue: { type: String, required: true }
});

module.exports = mongoose.model('MutualFundMetadata', mutualFundMetadataSchema);
