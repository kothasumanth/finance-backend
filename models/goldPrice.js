const mongoose = require('mongoose');

const goldPriceSchema = new mongoose.Schema({
  price24k: { type: Number, required: true, default: 1 },
  price22k: { type: Number, required: true, default: 1 },
  price18k: { type: Number, required: true, default: 1 },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GoldPrice', goldPriceSchema);
