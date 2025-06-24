const mongoose = require('mongoose');

const pfInterestSchema = new mongoose.Schema({
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  rateOfInterest: { type: Number, required: true },
});

const PFInterest = mongoose.model('PFInterest', pfInterestSchema);

module.exports = PFInterest;
