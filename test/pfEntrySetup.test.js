const assert = require('node:assert/strict');
const test = require('node:test');
const setupPFPeriods = require('../pfEntrySetup');

const userId = '123456789012345678901234';
const pfTypeId = 'abcdefabcdefabcdefabcdef';

function createModels(initialEntries = [], interestRows = [{
  _id: 'interest-id',
  pfType: pfTypeId,
  startDate: new Date('2000-01-01T00:00:00.000Z'),
  endDate: new Date('2100-12-31T00:00:00.000Z')
}]) {
  const entries = initialEntries.map(entry => ({ ...entry, date: new Date(entry.date) }));
  const PFEntry = {
    find: () => ({
      sort: async () => [...entries].sort((a, b) => a.date - b.date)
    }),
    deleteMany: async ({ date }) => {
      const before = entries.length;
      for (let index = entries.length - 1; index >= 0; index--) {
        if (entries[index].date >= date.$gte) entries.splice(index, 1);
      }
      return { deletedCount: before - entries.length };
    },
    insertMany: async newEntries => {
      const inserted = newEntries.map(entry => ({ ...entry, date: new Date(entry.date) }));
      entries.push(...inserted);
      return inserted;
    }
  };
  const PFInterest = {
    find: async () => interestRows
  };
  const mongoose = {
    Types: {
      ObjectId: {
        isValid: value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
      }
    }
  };
  return { entries, models: { PFEntry, PFInterest, mongoose } };
}

function entry(date, amountDeposited = 0, balance = 0) {
  return { userId, pfTypeId, date: new Date(`${date}T00:00:00.000Z`), amountDeposited, balance };
}

test('creates the existing 15-year monthly range when setting up a new account', async () => {
  const { entries, models } = createModels();
  const result = await setupPFPeriods(models, {
    userId,
    pfTypeId,
    startDate: '2010-03-15'
  });

  assert.equal(result.createdCount, 180);
  assert.equal(result.startDate, '2010-04-01');
  assert.equal(result.endDate, '2025-03-01');
  assert.equal(entries.length, 180);
  assert.equal(entries[0].date.toISOString().slice(0, 10), '2010-04-01');
  assert.equal(entries.at(-1).date.toISOString().slice(0, 10), '2025-03-01');
});

test('extends existing periods without changing their deposits or balances', async () => {
  const originalEntries = [
    entry('2024-12-01', 500, 500),
    entry('2025-01-01', 1000, 1500)
  ];
  const { entries, models } = createModels(originalEntries);
  const result = await setupPFPeriods(models, {
    userId,
    pfTypeId,
    startDate: '1990-04-01',
    endDate: '2025-03-31'
  });

  assert.equal(result.createdCount, 2);
  assert.equal(entries.length, 4);
  assert.equal(entries[0].amountDeposited, 500);
  assert.equal(entries[1].amountDeposited, 1000);
  assert.deepEqual(entries.slice(2).map(item => item.date.toISOString().slice(0, 10)), [
    '2025-02-01',
    '2025-03-01'
  ]);
  assert.ok(entries.slice(2).every(item => item.amountDeposited === 0 && item.balance === 1500));
});

test('matches interest periods stored as date strings when extending PF periods', async () => {
  const { entries, models } = createModels(
    [entry('2025-01-01', 100, 100)],
    [{
      _id: 'prior-interest-id',
      pfType: pfTypeId,
      startDate: '2024-04-01T00:00:00.000Z',
      endDate: '2031-03-31T00:00:00.000Z'
    }]
  );
  const result = await setupPFPeriods(models, {
    userId,
    pfTypeId,
    endDate: '2025-03-31'
  });

  assert.equal(result.createdCount, 2);
  assert.deepEqual(entries.slice(1).map(item => item.pfInterestId), [
    'prior-interest-id',
    'prior-interest-id'
  ]);
});

test('matches restored PF interest rows whose type ID is stored as a string', async () => {
  const { entries, models } = createModels(
    [entry('2026-09-01', 100, 100)],
    [{
      _id: 'restored-interest-id',
      pfType: String(pfTypeId),
      startDate: '2026-04-01',
      endDate: '2031-03-31'
    }]
  );
  const result = await setupPFPeriods(models, {
    userId,
    pfTypeId,
    endDate: '2026-12-31'
  });

  assert.equal(result.createdCount, 3);
  assert.ok(entries.slice(1).every(item => item.pfInterestId === 'restored-interest-id'));
});

test('reports a clear error when no interest rate exists for a new period', async () => {
  const { entries, models } = createModels([entry('2025-01-01')], []);

  await assert.rejects(
    setupPFPeriods(models, { userId, pfTypeId, endDate: '2025-02-28' }),
    error => {
      assert.equal(error.status, 400);
      assert.match(error.message, /No PF interest rate is configured for 2025-02/);
      return true;
    }
  );
  assert.equal(entries.length, 1);
});

test('blocks reducing periods that still contain deposits', async () => {
  const originalEntries = [
    entry('2025-01-01', 100, 100),
    entry('2025-02-01', 0, 100),
    entry('2025-03-01', 250, 350),
    entry('2025-04-01', 0, 350)
  ];
  const { entries, models } = createModels(originalEntries);

  await assert.rejects(
    setupPFPeriods(models, { userId, pfTypeId, endDate: '2025-02-28' }),
    error => {
      assert.equal(error.status, 409);
      assert.deepEqual(error.periods, [{ date: '2025-03-01', amountDeposited: 250 }]);
      return true;
    }
  );
  assert.equal(entries.length, 4);
  assert.equal(entries[2].amountDeposited, 250);
});

test('removes only zero-deposit periods after the selected end month', async () => {
  const originalEntries = [
    entry('2025-01-01', 100, 100),
    entry('2025-02-01', 0, 100),
    entry('2025-03-01', 0, 100),
    entry('2025-04-01', 0, 100)
  ];
  const { entries, models } = createModels(originalEntries);
  const result = await setupPFPeriods(models, {
    userId,
    pfTypeId,
    endDate: '2025-02-28'
  });

  assert.equal(result.deletedCount, 2);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(item => item.date.toISOString().slice(0, 10)), [
    '2025-01-01',
    '2025-02-01'
  ]);
  assert.equal(entries[0].amountDeposited, 100);
});
