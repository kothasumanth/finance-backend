const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const Role = require('../models/role');
const User = require('../models/user');
const adminRouter = require('../routes/admin');
const userOwnedModels = require('../userOwnedModels');
const { isAdmin } = require('../auth');

function getHandler(method, path) {
  const layer = adminRouter.stack.find(item => (
    item.route?.path === path && item.route.methods[method.toLowerCase()]
  ));
  assert.ok(layer, `Missing ${method} ${path} route`);
  return layer.route.stack[0].handle;
}

async function invoke(handler, overrides = {}) {
  const req = {
    user: { _id: new mongoose.Types.ObjectId(), roleId: { key: 'admin' } },
    body: {},
    params: {},
    ...overrides
  };
  const res = {
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
  let forwardedError;
  await handler(req, res, error => { forwardedError = error; });
  if (forwardedError) throw forwardedError;
  return res;
}

function mockTargetUser(target) {
  const originalFindById = User.findById;
  User.findById = () => ({
    select() {
      return {
        populate: async () => target
      };
    }
  });
  return () => { User.findById = originalFindById; };
}

test('recognizes database-backed Admin and Member roles', () => {
  assert.equal(isAdmin({ roleId: { key: 'admin' } }), true);
  assert.equal(isAdmin({ roleId: { key: 'member' } }), false);
  assert.equal(User.schema.path('roleId').options.ref, 'Role');
  assert.equal(Role.schema.path('key').options.enum.includes('admin'), true);
  assert.equal(Role.schema.path('key').options.enum.includes('member'), true);
});

test('admin API denies non-admin users', async () => {
  const middleware = adminRouter.stack.find(layer => !layer.route).handle;
  const res = await invoke(middleware, { user: { _id: new mongoose.Types.ObjectId(), roleId: { key: 'member' } } });
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /Administrator access/);
});

test('prevents deleting the signed-in administrator', async () => {
  const userId = new mongoose.Types.ObjectId();
  const restoreFindById = mockTargetUser({
    _id: userId,
    name: 'Sumanth',
    normalizedName: 'sumanth',
    roleId: { key: 'admin' },
    isActive: true
  });
  try {
    const res = await invoke(getHandler('DELETE', '/users/:id'), {
      params: { id: userId.toString() },
      user: { _id: userId, roleId: { key: 'admin' } }
    });
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /cannot delete your own account/);
  } finally {
    restoreFindById();
  }
});

test('deletes all user-owned collections before deleting the account', async () => {
  const userId = new mongoose.Types.ObjectId();
  const target = {
    _id: userId,
    name: 'Member One',
    normalizedName: 'member one',
    roleId: { key: 'member' },
    isActive: true,
    async save() { this.isActive = false; }
  };
  const restoreFindById = mockTargetUser(target);
  const originalDeleteOne = User.deleteOne;
  const originalDeleteMany = userOwnedModels.map(model => model.deleteMany);
  const deletedModels = [];
  userOwnedModels.forEach(model => {
    model.deleteMany = async filter => {
      assert.deepEqual(filter, { userId });
      deletedModels.push(model);
      return { deletedCount: 2 };
    };
  });
  User.deleteOne = async filter => {
    assert.deepEqual(filter, { _id: userId, isActive: false });
    assert.equal(deletedModels.length, userOwnedModels.length);
    return { deletedCount: 1 };
  };

  try {
    const res = await invoke(getHandler('DELETE', '/users/:id'), {
      params: { id: userId.toString() }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(deletedModels.length, userOwnedModels.length);
  } finally {
    restoreFindById();
    User.deleteOne = originalDeleteOne;
    userOwnedModels.forEach((model, index) => { model.deleteMany = originalDeleteMany[index]; });
  }
});

test('leaves a disabled account for retry if financial-data cleanup fails', async () => {
  const userId = new mongoose.Types.ObjectId();
  const target = {
    _id: userId,
    name: 'Member One',
    normalizedName: 'member one',
    roleId: { key: 'member' },
    isActive: true,
    async save() { this.isActive = false; }
  };
  const restoreFindById = mockTargetUser(target);
  const originalDeleteMany = userOwnedModels.map(model => model.deleteMany);
  userOwnedModels.forEach((model, index) => {
    model.deleteMany = index === 0
      ? async () => { throw new Error('database unavailable'); }
      : async () => ({ deletedCount: 0 });
  });

  try {
    const res = await invoke(getHandler('DELETE', '/users/:id'), {
      params: { id: userId.toString() }
    });
    assert.equal(res.statusCode, 500);
    assert.equal(target.isActive, false);
    assert.match(res.body.error, /retry deletion/);
  } finally {
    restoreFindById();
    userOwnedModels.forEach((model, index) => { model.deleteMany = originalDeleteMany[index]; });
  }
});
