const mongoose = require('mongoose');

const mfNavAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fundId: { type: mongoose.Schema.Types.ObjectId, ref: 'MutualFundMetadata', required: true },
  latestNav: { type: Number, required: true },
  latestNavDate: { type: String, required: true },
  matchingDate: { type: String, required: true },
  isDismissed: { type: Boolean, default: false, required: true },
  isDemo: { type: Boolean, default: false, required: true }
}, { timestamps: true });

mfNavAlertSchema.index({ userId: 1, fundId: 1 }, { unique: true });

module.exports = mongoose.model('MfNavAlert', mfNavAlertSchema);
