const assert = require('node:assert/strict');
const test = require('node:test');
const GoldEntry = require('../models/goldEntry');
const MutualFundEntry = require('../models/mutualFundEntry');
const { authorizeOwnedData } = require('../authorization');
const { requireAdminForSharedWrites, requireSameOrigin } = require('../auth');

function invoke(middleware, request) {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  return new Promise((resolve, reject) => {
    Promise.resolve(middleware(request, response, error => {
      if (error) reject(error);
      else resolve({ request, response, next: true });
    })).then(() => {
      if (response.body) resolve({ request, response, next: false });
    }, reject);
  });
}

function request(overrides = {}) {
  return {
    user: { _id: 'user-one', role: 'user' },
    method: 'GET',
    path: '/',
    params: {},
    query: {},
    body: {},
    get: () => undefined,
    ...overrides
  };
}

test('rejects requests that select another user by path', async () => {
  const { response, next } = await invoke(authorizeOwnedData, request({
    method: 'GET',
    path: '/mutual-funds/user-two'
  }));
  assert.equal(next, false);
  assert.equal(response.statusCode, 403);
});

test('requires an explicit owner filter for gold-entry reads', async () => {
  const { response, next } = await invoke(authorizeOwnedData, request({
    method: 'GET',
    path: '/gold-entries'
  }));
  assert.equal(next, false);
  assert.equal(response.statusCode, 400);
});

test('binds new mutual-fund entries to the authenticated user', async () => {
  const { request: result, next } = await invoke(authorizeOwnedData, request({
    method: 'POST',
    path: '/mutual-funds',
    body: {}
  }));
  assert.equal(next, true);
  assert.equal(result.body.userId, 'user-one');
});

test('does not allow updates by another user’s record ID', async () => {
  const originalFindOne = MutualFundEntry.findOne;
  MutualFundEntry.findOne = async filter => {
    assert.deepEqual(filter, { _id: 'foreign-entry', userId: 'user-one' });
    return null;
  };
  try {
    const { response, next } = await invoke(authorizeOwnedData, request({
      method: 'PUT',
      path: '/mutual-funds/foreign-entry'
    }));
    assert.equal(next, false);
    assert.equal(response.statusCode, 404);
  } finally {
    MutualFundEntry.findOne = originalFindOne;
  }
});

test('does not allow updating another user’s gold-entry ID', async () => {
  const originalFindOne = GoldEntry.findOne;
  GoldEntry.findOne = async filter => {
    assert.deepEqual(filter, { _id: 'foreign-entry', userId: 'user-one' });
    return null;
  };
  try {
    const { response, next } = await invoke(authorizeOwnedData, request({
      method: 'POST',
      path: '/gold-entries',
      body: { _id: 'foreign-entry' }
    }));
    assert.equal(next, false);
    assert.equal(response.statusCode, 404);
  } finally {
    GoldEntry.findOne = originalFindOne;
  }
});

test('restricts shared settings writes to the administrator', async () => {
  const regularUser = await invoke(requireAdminForSharedWrites, request({
    method: 'POST',
    path: '/mutualfund-metadata'
  }));
  assert.equal(regularUser.next, false);
  assert.equal(regularUser.response.statusCode, 403);

  const admin = await invoke(requireAdminForSharedWrites, request({
    method: 'POST',
    path: '/mutualfund-metadata',
    user: { _id: 'admin', role: 'admin' }
  }));
  assert.equal(admin.next, true);
});

test('requires an allowed origin for state-changing requests', async () => {
  const denied = await invoke(requireSameOrigin, request({
    method: 'POST',
    get: () => 'https://attacker.example'
  }));
  assert.equal(denied.next, false);
  assert.equal(denied.response.statusCode, 403);

  const allowed = await invoke(requireSameOrigin, request({
    method: 'POST',
    get: () => 'http://localhost:5173'
  }));
  assert.equal(allowed.next, true);
});
