const mongoose = require('mongoose');

const goldEntrySchema = new mongoose.Schema({
  purchaseDate: { type: Date, required: true },
  grams: { type: Number, required: true },
  price: { type: Number, required: true },
  comments: { type: String }
});

module.exports = mongoose.model('GoldEntry', goldEntrySchema);
