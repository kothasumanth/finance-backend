const jwt = require('jsonwebtoken');
const User = require('./models/user');

const COOKIE_NAME = 'finance_session';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function getRoleKey(user) {
  return user.roleId?.key || (user.role === 'admin' ? 'admin' : 'member');
}

function isAdmin(user) {
  return getRoleKey(user) === 'admin';
}

function createToken(user) {
  if (!process.env.AUTH_JWT_SECRET) {
    throw new Error('AUTH_JWT_SECRET must be configured before authentication can be used');
  }

  return jwt.sign(
    { sub: user._id.toString() },
    process.env.AUTH_JWT_SECRET,
    {
      audience: 'finance-copilot-web',
      expiresIn: '8h',
      issuer: 'finance-copilot'
    }
  );
}

function setSessionCookie(res, user) {
  res.cookie(COOKIE_NAME, createToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || !process.env.AUTH_JWT_SECRET) {
    return res.status(401).json({ error: 'Please log in' });
  }

  try {
    const payload = jwt.verify(token, process.env.AUTH_JWT_SECRET, {
      audience: 'finance-copilot-web',
      issuer: 'finance-copilot'
    });
    const user = await User.findById(payload.sub).select('+passwordHash').populate('roleId');
    if (!user || !user.passwordHash || !user.isActive) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Please log in again' });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Please log in again' });
    }
    return next(error);
  }
}

function requirePasswordChanged(req, res, next) {
  if (req.user.mustChangePassword) {
    return res.status(403).json({ error: 'Change your temporary password before continuing' });
  }
  return next();
}

function requireAdminForSharedWrites(req, res, next) {
  const adminOnlyWrites = new Set([
    'POST /users',
    'GET /users-table',
    'GET /users-table-json',
    'POST /mutual-funds/backfill-units',
    'POST /pfentry/create-collection',
    'POST /pfentry/recalculate-all',
    'POST /pf-types/seed',
    'POST /gold-price',
    'POST /pf-interest',
    'PUT /pf-interest/:id',
    'DELETE /pf-interest/:id',
    'POST /mutualfund-metadata',
    'PUT /mutualfund-metadata/:id',
    'DELETE /mutualfund-metadata/:id',
    'POST /api/mfcaptypes',
    'PUT /api/mfcaptypes/:id',
    'DELETE /api/mfcaptypes/:id'
  ]);
  const routeKey = `${req.method} ${req.path.replace(/[0-9a-f]{24}(?=\/|$)/gi, ':id')}`;

  if (adminOnlyWrites.has(routeKey) && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only the administrator can change shared settings' });
  }
  return next();
}

function requireSameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    process.env.FRONTEND_ORIGIN
  ].filter(Boolean));

  if (!req.get('Origin') || !allowedOrigins.has(req.get('Origin'))) {
    return res.status(403).json({ error: 'Request origin is not allowed' });
  }
  return next();
}

module.exports = {
  clearSessionCookie,
  requireAuth,
  requireAdminForSharedWrites,
  requirePasswordChanged,
  requireSameOrigin,
  isAdmin,
  setSessionCookie
};
