const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  key: { type: String, enum: ['admin', 'member'], required: true, unique: true },
  name: { type: String, enum: ['Admin', 'Member'], required: true, unique: true }
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);
