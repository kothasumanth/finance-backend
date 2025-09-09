const mongoose = require('mongoose');

const fdDetailsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bankName: {
    type: String,
    required: true
  },
  accountNo: {
    type: String,
    required: true
  },
  principal: {
    type: Number,
    required: true
  },
  interestRate: {
    type: Number,
    required: true
  },
  period: {
    type: String,
    required: true
  },
  maturityAmount: {
    type: Number,
    required: true
  },
  typeOfAccount: {
    type: String,
    required: true
  },
  openDate: {
    type: Date,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('FDDetails', fdDetailsSchema);
