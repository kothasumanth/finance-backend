const mongoose = require('mongoose');

const pfTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
});

const PFType = mongoose.model('PFType', pfTypeSchema);

module.exports = PFType;
