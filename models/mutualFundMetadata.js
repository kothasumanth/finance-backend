const mongoose = require('mongoose');

const mutualFundMetadataSchema = new mongoose.Schema({
  MutualFundName: { type: String, required: true },
  GoogleValue: { type: String, required: true },
  ActiveOrPassive: { type: String, default: '' },
  IndexOrManaged: { type: String, default: '' },
  CapType: { type: String, default: '' }
});

module.exports = mongoose.model('MutualFundMetadata', mutualFundMetadataSchema);
