const mongoose = require('mongoose');

const expenseTypeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  normalizedName: { type: String, required: true, trim: true }
}, { timestamps: true });

expenseTypeSchema.index({ userId: 1, normalizedName: 1 }, { unique: true });

module.exports = mongoose.model('ExpenseType', expenseTypeSchema);
