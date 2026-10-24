const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, unique: true, sparse: true, select: false },
  passwordHash: { type: String, select: false },
  mustChangePassword: { type: Boolean, default: false },
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('User', userSchema);
