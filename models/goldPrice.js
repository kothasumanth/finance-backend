const mongoose = require('mongoose');

const goldPriceSchema = new mongoose.Schema({
  price: { type: Number, required: true },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GoldPrice', goldPriceSchema);
