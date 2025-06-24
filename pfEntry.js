const mongoose = require('mongoose');

const pfEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pfTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'PFType', required: true },
  date: { type: Date, required: true },
  pfInterestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PFInterest', required: true },
  monthInterest: { type: Number, required: false },
  openingBalance: { type: Number, required: false },
  amountDeposited: { type: Number, required: false, default: 0 },
});

const PFEntry = mongoose.model('PFEntry', pfEntrySchema);

module.exports = PFEntry;
