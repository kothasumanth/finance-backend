const GoldEntry = require('./models/goldEntry');
const MutualFundEntry = require('./models/mutualFundEntry');
const PFEntry = require('./pfEntry');
const SIPInfo = require('./models/sipInfo');

const ownedRecordRoutes = [
  { pattern: /^\/mutual-funds\/([^/]+)$/, methods: new Set(['PUT', 'DELETE']), model: MutualFundEntry },
  { pattern: /^\/gold-entries\/([^/]+)$/, methods: new Set(['DELETE']), model: GoldEntry },
  { pattern: /^\/sip-info\/([^/]+)$/, methods: new Set(['PUT', 'DELETE']), model: SIPInfo },
  { pattern: /^\/pfentry\/([^/]+)$/, methods: new Set(['PUT']), model: PFEntry }
];

async function authorizeOwnedData(req, res, next) {
  const userId = req.user._id.toString();
  const userPathPatterns = req.method === 'GET'
    ? [
      /^\/users\/([^/]+)$/,
      /^\/mutual-funds\/([^/]+)$/,
      /^\/sip-info\/([^/]+)$/,
      /^\/expected-percentages\/([^/]+)$/,
      /^\/pfentry\/user\/([^/]+)\/type\/[^/]+$/,
      /^\/mf-nav\/([^/]+)\//
    ]
    : req.method === 'POST'
      ? [/^\/expected-percentages\/([^/]+)$/]
      : req.method === 'DELETE'
        ? [/^\/pfentry\/user\/([^/]+)\/type\/[^/]+$/]
        : [];
  const pathUserId = userPathPatterns.map(pattern => req.path.match(pattern)?.[1]).find(Boolean);
  const requestedIds = [
    pathUserId,
    req.params.userId,
    req.query.userId,
    req.body?.userId
  ].filter(value => value !== undefined && value !== null && value !== '');

  if (requestedIds.some(requestedId => requestedId.toString() !== userId)) {
    return res.status(403).json({ error: 'You can only access your own financial data' });
  }

  const path = req.path;
  if (req.method === 'GET' && path === '/gold-entries' && !req.query.userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    const bodyOwnedRoutes = [
      '/mutual-funds',
      '/mutual-funds/recal',
      '/mutual-funds/force-null',
      '/pfentry/ppf-bulk-create',
      '/pfentry/pf-bulk-create',
      '/sip-info',
      '/gold-entries'
    ];
    if (bodyOwnedRoutes.includes(path)) req.body.userId = userId;
  }

  let recordId;
  let model;

  for (const route of ownedRecordRoutes) {
    const match = path.match(route.pattern);
    if (match && route.methods.has(req.method)) {
      recordId = match[1];
      model = route.model;
      break;
    }
  }

  if (req.method === 'POST' && path === '/gold-entries' && req.body?._id) {
    recordId = req.body._id;
    model = GoldEntry;
  }

  if (recordId && model) {
    try {
      const ownedRecord = await model.findOne({ _id: recordId, userId });
      if (!ownedRecord) {
        return res.status(404).json({ error: 'Record not found' });
      }
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(404).json({ error: 'Record not found' });
      }
      return next(error);
    }
  }

  if (
    (req.method === 'POST' && path === '/users')
  ) {
    return res.status(403).json({ error: 'This operation is not available' });
  }

  return next();
}

module.exports = { authorizeOwnedData };
