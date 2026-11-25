const express = require('express');
const mongoose = require('mongoose');
const MfNavAlert = require('../models/mfNavAlert');
const MutualFundEntry = require('../models/mutualFundEntry');
const {
  evaluateNavAlert,
  shouldExpireNavAlert,
  shouldReplaceNavAlert
} = require('../navAlertEvaluation');
const { getMfHistory } = require('../mfApiCache');

const router = express.Router();
const LOOKBACK_DAYS = 60;
const NAV_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CONCURRENT_HISTORY_REQUESTS = 4;

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await callback(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function saveNotification(userId, fundId, evaluation) {
  const filter = { userId, fundId };
  const current = await MfNavAlert.findOne(filter);
  if (!shouldReplaceNavAlert(current, evaluation)) return current;

  const update = {
    $set: {
      latestNav: evaluation.latestNav,
      latestNavDate: evaluation.latestDate,
      matchingDate: evaluation.matchingDate,
      isDismissed: false,
      isDemo: false
    },
    $setOnInsert: { userId, fundId }
  };

  try {
    return await MfNavAlert.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return MfNavAlert.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true
    });
  }
}

router.get('/', async (req, res, next) => {
  try {
    const entries = await MutualFundEntry.find({
      userId: req.user._id,
      investType: 'Invest',
      balanceUnit: { $gt: 0 }
    }).populate('fundName', 'MutualFundName GoogleValue');

    const fundsById = new Map();
    for (const entry of entries) {
      const fund = entry.fundName;
      if (fund?._id) fundsById.set(fund._id.toString(), fund);
    }
    const funds = [...fundsById.values()];

    let failedChecks = 0;
    await mapWithConcurrency(funds, MAX_CONCURRENT_HISTORY_REQUESTS, async fund => {
      if (!fund.GoogleValue?.trim()) {
        failedChecks += 1;
        console.warn(`Skipping NAV notification check for "${fund.MutualFundName}": no NAV scheme code configured`);
        return;
      }

      try {
        const history = await getMfHistory(fund.GoogleValue, { maxAgeMs: NAV_CACHE_MAX_AGE_MS });
        const evaluation = evaluateNavAlert(history, LOOKBACK_DAYS);
        const current = await MfNavAlert.findOne({ userId: req.user._id, fundId: fund._id });
        if (evaluation.triggered) {
          if (shouldReplaceNavAlert(current, evaluation)) {
            await saveNotification(req.user._id, fund._id, evaluation);
          }
        } else if (shouldExpireNavAlert(current, evaluation)) {
          await MfNavAlert.updateOne(
            { _id: current._id, userId: req.user._id },
            { $set: { isDismissed: true } }
          );
        }
      } catch (error) {
        failedChecks += 1;
        console.error(`Unable to check NAV notification for "${fund.MutualFundName}":`, error);
      }
    });

    const notifications = await MfNavAlert.find({
      userId: req.user._id,
      isDismissed: false,
      fundId: { $in: funds.map(fund => fund._id) },
      latestNav: { $exists: true }
    }).populate('fundId', 'MutualFundName')
      .sort({ latestNavDate: -1, updatedAt: -1 });

    return res.json({
      notifications: notifications.map(notification => ({
        _id: notification._id,
        fund: {
          _id: notification.fundId?._id,
          name: notification.fundId?.MutualFundName
        },
        latestNav: notification.latestNav,
        latestDate: notification.latestNavDate,
        matchingDate: notification.matchingDate,
        isDemo: notification.isDemo
      })),
      failedChecks
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'NAV notification not found' });
  }
  if (typeof req.body?.isDismissed !== 'boolean') {
    return res.status(400).json({ error: 'isDismissed must be true or false' });
  }

  try {
    const notification = await MfNavAlert.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { isDismissed: req.body.isDismissed } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'NAV notification not found' });
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
