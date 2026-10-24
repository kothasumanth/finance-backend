const ExpectedPercentage = require('./models/expectedPercentage');
const Expense = require('./models/expense');
const ExpenseType = require('./models/expenseType');
const GoldEntry = require('./models/goldEntry');
const MutualFundEntry = require('./models/mutualFundEntry');
const PFEntry = require('./pfEntry');
const SIPInfo = require('./models/sipInfo');

module.exports = [
  ExpectedPercentage,
  Expense,
  ExpenseType,
  GoldEntry,
  MutualFundEntry,
  PFEntry,
  SIPInfo
];
