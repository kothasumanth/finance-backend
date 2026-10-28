const express = require('express');
const mongoose = require('mongoose');
const Expense = require('../models/expense');
const ExpenseType = require('../models/expenseType');

const router = express.Router();

function normalizeTypeName(name) {
  return name.trim().normalize('NFKC');
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function handleDuplicateType(error, res) {
  if (error.code !== 11000) return false;
  res.status(409).json({ error: 'An expense type with that name already exists' });
  return true;
}

router.get('/types', async (req, res, next) => {
  try {
    const types = await ExpenseType.find({ userId: req.user._id }).sort({ name: 1 });
    res.json(types);
  } catch (error) {
    next(error);
  }
});

router.post('/types', async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? normalizeTypeName(req.body.name) : '';
  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ error: 'Expense type must be between 2 and 60 characters' });
  }

  try {
    const type = await ExpenseType.create({
      userId: req.user._id,
      name,
      normalizedName: name.toLocaleLowerCase('en-US')
    });
    return res.status(201).json(type);
  } catch (error) {
    if (handleDuplicateType(error, res)) return;
    return next(error);
  }
});

router.put('/types/:id', async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? normalizeTypeName(req.body.name) : '';
  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ error: 'Expense type must be between 2 and 60 characters' });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Expense type not found' });
  }

  try {
    const type = await ExpenseType.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { name, normalizedName: name.toLocaleLowerCase('en-US') } },
      { new: true, runValidators: true }
    );
    if (!type) return res.status(404).json({ error: 'Expense type not found' });
    return res.json(type);
  } catch (error) {
    if (handleDuplicateType(error, res)) return;
    return next(error);
  }
});

router.delete('/types/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Expense type not found' });
  }

  try {
    const type = await ExpenseType.findOne({ _id: req.params.id, userId: req.user._id });
    if (!type) return res.status(404).json({ error: 'Expense type not found' });

    const expenseCount = await Expense.countDocuments({
      userId: req.user._id,
      expenseTypeId: type._id
    });
    if (expenseCount > 0) {
      return res.status(409).json({
        error: 'Delete all expense entries associated with this expense type before deleting it.'
      });
    }

    await ExpenseType.deleteOne({ _id: type._id, userId: req.user._id });
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/overview', async (req, res, next) => {
  try {
    const months = await Expense.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          total: { $sum: '$amount' },
          entryCount: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          total: 1,
          entryCount: 1
        }
      }
    ]);
    return res.json(months);
  } catch (error) {
    return next(error);
  }
});

router.get('/analysis', async (req, res, next) => {
  const year = Number(req.query.year);
  const month = req.query.month === undefined ? undefined : Number(req.query.month);
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    return res.status(400).json({ error: 'A valid year is required' });
  }
  if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
    return res.status(400).json({ error: 'Month must be between 1 and 12' });
  }

  const start = new Date(Date.UTC(year, month === undefined ? 0 : month - 1, 1));
  const end = new Date(Date.UTC(year, month === undefined ? 12 : month, 1));

  try {
    const categories = await Expense.aggregate([
      { $match: { userId: req.user._id, date: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: '$expenseTypeId',
          total: { $sum: '$amount' },
          entryCount: { $sum: 1 },
          entries: { $push: { date: '$date', amount: '$amount' } }
        }
      },
      {
        $lookup: {
          from: ExpenseType.collection.name,
          let: { typeId: '$_id' },
          pipeline: [
            {
              $match: {
                userId: req.user._id,
                $expr: { $eq: ['$_id', '$$typeId'] }
              }
            },
            { $project: { name: 1 } }
          ],
          as: 'expenseType'
        }
      },
      { $unwind: '$expenseType' },
      { $project: { _id: 0, expenseTypeId: '$_id', name: '$expenseType.name', total: 1, entryCount: 1, entries: 1 } },
      { $sort: { total: -1, name: 1 } }
    ]);
    return res.json(categories);
  } catch (error) {
    return next(error);
  }
});

router.get('/entries', async (req, res, next) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    return res.status(400).json({ error: 'A valid year is required' });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Month must be between 1 and 12' });
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  try {
    const entries = await Expense.find({
      userId: req.user._id,
      date: { $gte: start, $lt: end }
    })
      .select('_id date amount comments expenseTypeId')
      .populate('expenseTypeId', 'name')
      .sort({ date: -1, _id: -1 });
    return res.json(entries);
  } catch (error) {
    return next(error);
  }
});

router.put('/entries/:id', async (req, res, next) => {
  const { date, expenseTypeId, amount: rawAmount, comments } = req.body || {};
  const amount = Number(rawAmount);
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Expense entry not found' });
  }
  if (
    !isValidDateOnly(date)
    || !mongoose.isValidObjectId(expenseTypeId)
    || !Number.isFinite(amount)
    || amount <= 0
  ) {
    return res.status(400).json({ error: 'Enter a valid date, expense type, and positive amount' });
  }
  if (comments !== undefined && (typeof comments !== 'string' || comments.length > 500)) {
    return res.status(400).json({ error: 'Comments must be text of at most 500 characters' });
  }

  try {
    const ownedType = await ExpenseType.exists({ _id: expenseTypeId, userId: req.user._id });
    if (!ownedType) {
      return res.status(400).json({ error: 'Select an expense type belonging to your account' });
    }

    const entry = await Expense.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      {
        $set: {
          date: new Date(`${date}T00:00:00.000Z`),
          expenseTypeId,
          amount,
          comments: typeof comments === 'string' ? comments.trim() : ''
        }
      },
      { new: true, runValidators: true }
    ).populate('expenseTypeId', 'name');
    if (!entry) return res.status(404).json({ error: 'Expense entry not found' });
    return res.json(entry);
  } catch (error) {
    return next(error);
  }
});

router.delete('/entries/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Expense entry not found' });
  }

  try {
    const result = await Expense.deleteOne({ _id: req.params.id, userId: req.user._id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Expense entry not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/entries', async (req, res, next) => {
  const entries = req.body?.entries;
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100) {
    return res.status(400).json({ error: 'Submit between 1 and 100 expense entries at a time' });
  }

  const userId = req.user._id;
  const validatedEntries = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const amount = Number(entry?.amount);
    if (
      !isValidDateOnly(entry?.date)
      || !mongoose.isValidObjectId(entry?.expenseTypeId)
      || !Number.isFinite(amount)
      || amount <= 0
    ) {
      return res.status(400).json({ error: `Entry ${index + 1} needs a valid date, expense type, and positive amount` });
    }
    if (entry.comments !== undefined && (
      typeof entry.comments !== 'string' || entry.comments.length > 500
    )) {
      return res.status(400).json({ error: `Comments for entry ${index + 1} must be text of at most 500 characters` });
    }

    validatedEntries.push({
      userId,
      expenseTypeId: entry.expenseTypeId,
      date: new Date(`${entry.date}T00:00:00.000Z`),
      amount,
      comments: typeof entry.comments === 'string' ? entry.comments.trim() : ''
    });
  }

  try {
    const typeIds = [...new Set(validatedEntries.map(entry => entry.expenseTypeId.toString()))];
    const ownedTypes = await ExpenseType.countDocuments({ _id: { $in: typeIds }, userId });
    if (ownedTypes !== typeIds.length) {
      return res.status(400).json({ error: 'Select an expense type belonging to your account' });
    }

    const created = await Expense.insertMany(validatedEntries, { ordered: true });
    return res.status(201).json({ createdCount: created.length });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
