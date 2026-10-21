const bcrypt = require('bcryptjs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/user');
const { requireAuth, setSessionCookie, clearSessionCookie } = require('../auth');

const router = express.Router();
const passwordRounds = 12;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many accounts created. Try again later.' }
});

function normalizeName(name) {
  return name.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128;
}

router.post('/login', loginLimiter, async (req, res, next) => {
  const { name, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || typeof password !== 'string') {
    return res.status(400).json({ error: 'Enter your name and password' });
  }

  try {
    const user = await User.findOne({ normalizedName: normalizeName(name) }).select('+passwordHash');
    const passwordMatches = user?.passwordHash && await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid name or password' });
    }

    setSessionCookie(res, user);
    return res.json({
      user: { id: user._id, name: user.name },
      mustChangePassword: user.mustChangePassword,
      isAdmin: user.role === 'admin'
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/register', registrationLimiter, async (req, res, next) => {
  const { name, password } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 50) {
    return res.status(400).json({ error: 'Name must be between 2 and 50 characters' });
  }
  if (!validPassword(password)) {
    return res.status(400).json({ error: 'Password must be between 12 and 128 characters' });
  }

  try {
    const normalizedName = normalizeName(name);
    const passwordHash = await bcrypt.hash(password, passwordRounds);
    const user = await User.create({
      name: name.trim().normalize('NFKC'),
      normalizedName,
      passwordHash,
      mustChangePassword: false
    });

    setSessionCookie(res, user);
    return res.status(201).json({ user: { id: user._id, name: user.name } });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'An account with that name already exists' });
    }
    return next(error);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: { id: req.user._id, name: req.user.name },
    mustChangePassword: req.user.mustChangePassword,
    isAdmin: req.user.role === 'admin'
  });
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !validPassword(newPassword)) {
    return res.status(400).json({ error: 'Enter your current password and a new password of at least 12 characters' });
  }

  try {
    if (!await bcrypt.compare(currentPassword, req.user.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (await bcrypt.compare(newPassword, req.user.passwordHash)) {
      return res.status(400).json({ error: 'Choose a password different from your current password' });
    }

    req.user.passwordHash = await bcrypt.hash(newPassword, passwordRounds);
    req.user.mustChangePassword = false;
    await req.user.save();
    setSessionCookie(res, req.user);
    return res.json({
      user: { id: req.user._id, name: req.user.name },
      isAdmin: req.user.role === 'admin'
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  return res.status(204).end();
});

module.exports = router;
