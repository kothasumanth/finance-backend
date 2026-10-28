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
          { date: '2026-10-20', expenseTypeId: expenseTypeId.toString(), amount: '42.50', comments: '  Lunch with client  ' },
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
    assert.equal(insertedEntries[0].comments, 'Lunch with client');
    assert.equal(insertedEntries[1].comments, '');
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

test('rejects comments longer than 500 characters', async () => {
  const { res } = await invoke('POST', '/entries', {
    body: {
      entries: [{
        date: '2026-10-21',
        expenseTypeId: new mongoose.Types.ObjectId().toString(),
        amount: 15,
        comments: 'x'.repeat(501)
      }]
    }
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /at most 500 characters/);
});

test('lists entries for the selected month, scoped to the signed-in account', async () => {
  const userId = new mongoose.Types.ObjectId();
  const expectedEntries = [{ amount: 15 }];
  const originalFind = Expense.find;
  let filter;
  Expense.find = query => {
    filter = query;
    return {
      select() {
        return {
          populate() {
            return {
              sort: async () => expectedEntries
            };
          }
        };
      }
    };
  };

  try {
    const { res } = await invoke('GET', '/entries', {
      user: { _id: userId },
      query: { year: '2026', month: '10' }
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, expectedEntries);
    assert.equal(filter.userId, userId);
    assert.deepEqual(filter.date, {
      $gte: new Date('2026-10-01T00:00:00.000Z'),
      $lt: new Date('2026-11-01T00:00:00.000Z')
    });
  } finally {
    Expense.find = originalFind;
  }
});

test('rejects invalid daily-view periods without querying entries', async () => {
  const originalFind = Expense.find;
  Expense.find = () => { throw new Error('Invalid periods must not query expenses'); };
  try {
    const invalidYear = await invoke('GET', '/entries', { query: { year: 'not-a-year', month: '10' } });
    const invalidMonth = await invoke('GET', '/entries', { query: { year: '2026', month: '13' } });
    assert.equal(invalidYear.res.statusCode, 400);
    assert.equal(invalidMonth.res.statusCode, 400);
  } finally {
    Expense.find = originalFind;
  }
});

test('updates only an expense owned by the signed-in account', async () => {
  const userId = new mongoose.Types.ObjectId();
  const entryId = new mongoose.Types.ObjectId();
  const expenseTypeId = new mongoose.Types.ObjectId();
  const updatedEntry = { _id: entryId, amount: 25 };
  const originalExists = ExpenseType.exists;
  const originalFindOneAndUpdate = Expense.findOneAndUpdate;
  let updateFilter;
  let updateDocument;
  ExpenseType.exists = async filter => {
    assert.deepEqual(filter, { _id: expenseTypeId.toString(), userId });
    return true;
  };
  Expense.findOneAndUpdate = (filter, update, options) => {
    updateFilter = filter;
    updateDocument = update;
    assert.deepEqual(options, { new: true, runValidators: true });
    return { populate: async () => updatedEntry };
  };

  try {
    const { res } = await invoke('PUT', '/entries/:id', {
      user: { _id: userId },
      params: { id: entryId.toString() },
      body: {
        date: '2026-10-22',
        expenseTypeId: expenseTypeId.toString(),
        amount: '25.50',
        comments: '  Updated note  '
      }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, updatedEntry);
    assert.deepEqual(updateFilter, { _id: entryId.toString(), userId });
    assert.deepEqual(updateDocument.$set, {
      date: new Date('2026-10-22T00:00:00.000Z'),
      expenseTypeId: expenseTypeId.toString(),
      amount: 25.5,
      comments: 'Updated note'
    });
  } finally {
    ExpenseType.exists = originalExists;
    Expense.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('does not update an expense that references another account’s type', async () => {
  const originalExists = ExpenseType.exists;
  const originalFindOneAndUpdate = Expense.findOneAndUpdate;
  ExpenseType.exists = async () => false;
  Expense.findOneAndUpdate = () => {
    throw new Error('Expenses must not be updated with an unowned type');
  };

  try {
    const { res } = await invoke('PUT', '/entries/:id', {
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: {
        date: '2026-10-22',
        expenseTypeId: new mongoose.Types.ObjectId().toString(),
        amount: 25
      }
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /belonging to your account/);
  } finally {
    ExpenseType.exists = originalExists;
    Expense.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('deletes only an expense owned by the signed-in account', async () => {
  const userId = new mongoose.Types.ObjectId();
  const entryId = new mongoose.Types.ObjectId();
  const originalDeleteOne = Expense.deleteOne;
  let filter;
  Expense.deleteOne = async query => {
    filter = query;
    return { deletedCount: 1 };
  };

  try {
    const { res } = await invoke('DELETE', '/entries/:id', {
      user: { _id: userId },
      params: { id: entryId.toString() }
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true });
    assert.deepEqual(filter, { _id: entryId.toString(), userId });
  } finally {
    Expense.deleteOne = originalDeleteOne;
  }
});

test('returns not found when an expense is not owned by the signed-in account', async () => {
  const originalDeleteOne = Expense.deleteOne;
  Expense.deleteOne = async () => ({ deletedCount: 0 });
  try {
    const { res } = await invoke('DELETE', '/entries/:id', {
      params: { id: new mongoose.Types.ObjectId().toString() }
    });
    assert.equal(res.statusCode, 404);
    assert.match(res.body.error, /not found/);
  } finally {
    Expense.deleteOne = originalDeleteOne;
  }
});

test('includes individual entries in category analysis', async () => {
  const originalAggregate = Expense.aggregate;
  let pipeline;
  const entries = [
    { date: new Date('2026-10-20T00:00:00.000Z'), amount: 42.5 },
    { date: new Date('2026-10-21T00:00:00.000Z'), amount: 15 }
  ];
  Expense.aggregate = async stages => {
    pipeline = stages;
    return [{ expenseTypeId: new mongoose.Types.ObjectId(), name: 'Amazon', total: 57.5, entryCount: 2, entries }];
  };

  try {
    const { res } = await invoke('GET', '/analysis', { query: { year: '2026', month: '10' } });
    const groupStage = pipeline.find(stage => stage.$group);
    assert.deepEqual(groupStage.$group.entries, { $push: { date: '$date', amount: '$amount' } });
    assert.deepEqual(res.body[0].entries, entries);
  } finally {
    Expense.aggregate = originalAggregate;
  }
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

test('deletes an expense type that has no associated entries', async () => {
  const userId = new mongoose.Types.ObjectId();
  const typeId = new mongoose.Types.ObjectId();
  const originalFindOne = ExpenseType.findOne;
  const originalCountDocuments = Expense.countDocuments;
  const originalDeleteOne = ExpenseType.deleteOne;
  let typeFilter;
  let expenseFilter;
  let deleteFilter;
  ExpenseType.findOne = async filter => {
    typeFilter = filter;
    return { _id: typeId };
  };
  Expense.countDocuments = async filter => {
    expenseFilter = filter;
    return 0;
  };
  ExpenseType.deleteOne = async filter => {
    deleteFilter = filter;
    return { deletedCount: 1 };
  };

  try {
    const { res } = await invoke('DELETE', '/types/:id', {
      user: { _id: userId },
      params: { id: typeId.toString() }
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true });
    assert.deepEqual(typeFilter, { _id: typeId.toString(), userId });
    assert.deepEqual(expenseFilter, { userId, expenseTypeId: typeId });
    assert.deepEqual(deleteFilter, { _id: typeId, userId });
  } finally {
    ExpenseType.findOne = originalFindOne;
    Expense.countDocuments = originalCountDocuments;
    ExpenseType.deleteOne = originalDeleteOne;
  }
});

test('prevents deleting an expense type that still has entries', async () => {
  const userId = new mongoose.Types.ObjectId();
  const typeId = new mongoose.Types.ObjectId();
  const originalFindOne = ExpenseType.findOne;
  const originalCountDocuments = Expense.countDocuments;
  const originalDeleteOne = ExpenseType.deleteOne;
  ExpenseType.findOne = async () => ({ _id: typeId });
  Expense.countDocuments = async () => 1;
  ExpenseType.deleteOne = async () => {
    throw new Error('Expense types with entries must not be deleted');
  };

  try {
    const { res } = await invoke('DELETE', '/types/:id', {
      user: { _id: userId },
      params: { id: typeId.toString() }
    });
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /Delete all expense entries associated/);
  } finally {
    ExpenseType.findOne = originalFindOne;
    Expense.countDocuments = originalCountDocuments;
    ExpenseType.deleteOne = originalDeleteOne;
  }
});
