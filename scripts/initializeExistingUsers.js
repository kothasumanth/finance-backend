require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/user');

function normalizeName(name) {
  return name.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

async function initializeExistingUsers() {
  const initialPassword = process.env.INITIAL_USER_PASSWORD;
  if (typeof initialPassword !== 'string' || initialPassword.length < 8 || initialPassword.length > 128) {
    throw new Error('Set INITIAL_USER_PASSWORD to a temporary password of 8-128 characters before running this script');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI must point to the database whose accounts you want to initialize');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const users = await User.find().select('+passwordHash');
    const names = new Set();
    for (const user of users) {
      const normalizedName = normalizeName(user.name);
      if (names.has(normalizedName)) {
        throw new Error('Duplicate user names found; resolve them before initializing login accounts');
      }
      names.add(normalizedName);
    }

    const pendingUsers = users.filter(user => !user.passwordHash);
    if (pendingUsers.length === 0) {
      console.log('No existing user accounts need initialization.');
      return;
    }

    for (const user of pendingUsers) {
      user.normalizedName = normalizeName(user.name);
      user.passwordHash = await bcrypt.hash(initialPassword, 12);
      user.mustChangePassword = true;
      user.role = user.normalizedName === 'sumanth' ? 'admin' : 'user';
      await user.save();
    }
    console.log(`Initialized ${pendingUsers.length} existing account(s); each must change the temporary password at next login.`);
  } finally {
    await mongoose.disconnect();
  }
}

initializeExistingUsers().catch(error => {
  console.error('Could not initialize existing users:', error.message);
  process.exitCode = 1;
});
