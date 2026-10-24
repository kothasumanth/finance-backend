const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expenseTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseType', required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true, min: 0.01 }
}, { timestamps: true });

expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ userId: 1, expenseTypeId: 1, date: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
