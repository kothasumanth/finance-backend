const mongoose = require('mongoose');

const mutualFundEntrySchema = new mongoose.Schema({
  fundName: { type: mongoose.Schema.Types.ObjectId, ref: 'MutualFundMetadata', required: true },
  purchaseDate: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  investType: { type: String, enum: ['Invest', 'Redeem'], required: true },
  amount: { type: Number, required: true },
  nav: { type: Number },
  units: { type: Number },
  isRedeemed: { type: Boolean, default: false },
  balanceUnit: { type: Number, default: 0 }
});

module.exports = mongoose.model('MutualFundEntry', mutualFundEntrySchema);
