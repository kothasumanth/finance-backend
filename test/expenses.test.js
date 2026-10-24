const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const Expense = require('../models/expense');
const ExpenseType = require('../models/expenseType');
const expensesRouter = require('../routes/expenses');

function getHandler(method, path) {
  const layer = expensesRouter.stack.find(item => (
    item.route?.path === path && item.route.methods[method.toLowerCase()]
  ));
  assert.ok(layer, `Missing ${method} ${path} route`);
  return layer.route.stack[0].handle;
}

async function invoke(method, path, overrides = {}) {
  const req = {
    user: { _id: new mongoose.Types.ObjectId() },
    body: {},
    params: {},
    query: {},
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
  await getHandler(method, path)(req, res, error => {
    forwardedError = error;
  });
  if (forwardedError) throw forwardedError;
  return { req, res };
}

test('creates a batch of expenses for the authenticated account only', async () => {
  const userId = new mongoose.Types.ObjectId();
  const expenseTypeId = new mongoose.Types.ObjectId();
  const originalCountDocuments = ExpenseType.countDocuments;
  const originalInsertMany = Expense.insertMany;
  let insertedEntries;
  ExpenseType.countDocuments = async filter => {
    assert.deepEqual(filter, { _id: { $in: [expenseTypeId.toString()] }, userId });
    return 1;
  };
  Expense.insertMany = async entries => {
    insertedEntries = entries;
    return entries;
  };

  try {
    const { req, res } = await invoke('POST', '/entries', {
      user: { _id: userId },
      body: {
        userId: new mongoose.Types.ObjectId().toString(),
        entries: [
          { date: '2026-10-20', expenseTypeId: expenseTypeId.toString(), amount: '42.50' },
          { date: '2026-10-21', expenseTypeId: expenseTypeId.toString(), amount: 15 }
        ]
      }
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.createdCount, 2);
    assert.equal(req.body.userId.toString() === userId.toString(), false);
    assert.ok(insertedEntries.every(entry => entry.userId === userId));
    assert.deepEqual(insertedEntries.map(entry => entry.amount), [42.5, 15]);
    assert.equal(insertedEntries[0].date.toISOString(), '2026-10-20T00:00:00.000Z');
  } finally {
    ExpenseType.countDocuments = originalCountDocuments;
    Expense.insertMany = originalInsertMany;
  }
});

test('rejects expense entries that reference another account’s type', async () => {
  const originalCountDocuments = ExpenseType.countDocuments;
  const originalInsertMany = Expense.insertMany;
  ExpenseType.countDocuments = async () => 0;
  Expense.insertMany = async () => {
    throw new Error('Expenses must not be inserted with an unowned type');
  };

  try {
    const { res } = await invoke('POST', '/entries', {
      body: {
        entries: [{
          date: '2026-10-21',
          expenseTypeId: new mongoose.Types.ObjectId().toString(),
          amount: 15
        }]
      }
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /belonging to your account/);
  } finally {
    ExpenseType.countDocuments = originalCountDocuments;
    Expense.insertMany = originalInsertMany;
  }
});

test('rejects invalid calendar dates and non-positive amounts in a batch', async () => {
  const { res } = await invoke('POST', '/entries', {
    body: {
      entries: [{
        date: '2026-02-30',
        expenseTypeId: new mongoose.Types.ObjectId().toString(),
        amount: 0
      }]
    }
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Entry 1 needs a valid date/);
});

test('rejects invalid analysis periods before querying expenses', async () => {
  const originalAggregate = Expense.aggregate;
  Expense.aggregate = async () => {
    throw new Error('Invalid periods must not query expenses');
  };

  try {
    const invalidYear = await invoke('GET', '/analysis', { query: { year: 'not-a-year' } });
    const invalidMonth = await invoke('GET', '/analysis', { query: { year: '2026', month: '13' } });
    assert.equal(invalidYear.res.statusCode, 400);
    assert.equal(invalidMonth.res.statusCode, 400);
  } finally {
    Expense.aggregate = originalAggregate;
  }
});
