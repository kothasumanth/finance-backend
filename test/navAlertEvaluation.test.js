const assert = require('node:assert/strict');
const test = require('node:test');
const MfNavAlert = require('../models/mfNavAlert');
const {
  evaluateNavAlert,
  parseMfapiDate,
  shouldExpireNavAlert,
  shouldReplaceNavAlert
} = require('../navAlertEvaluation');

test('stores one notification per user and mutual fund', () => {
  const uniqueNotificationIndex = MfNavAlert.schema.indexes().find(([fields, options]) =>
    fields.userId === 1 && fields.fundId === 1 && options.unique
  );
  assert.ok(uniqueNotificationIndex);
  assert.equal(MfNavAlert.schema.path('isDismissed').options.default, false);
  assert.equal(MfNavAlert.schema.path('isDemo').options.default, false);
  assert.equal(MfNavAlert.schema.path('isDemo').options.default, false);
});

test('parses valid MFAPI dates and rejects impossible dates', () => {
  assert.equal(parseMfapiDate('09-11-2026').toISOString(), '2026-11-09T00:00:00.000Z');
  assert.equal(parseMfapiDate('31-02-2026'), null);
  assert.equal(parseMfapiDate('9-11-2026'), null);
});

test('triggers only when the latest NAV exactly matches an earlier NAV within 60 days', () => {
  const result = evaluateNavAlert({
    data: [
      { date: '12-11-2026', nav: '98.00' },
      { date: '10-11-2026', nav: '98.00' },
      { date: '08-11-2026', nav: '98.00' },
      { date: '01-10-2026', nav: '90.00' }
    ]
  });

  assert.equal(result.triggered, true);
  assert.equal(result.latestNav, 98);
  assert.equal(result.matchingDate, '2026-11-10');
});

test('does not trigger for a NAV merely below the previous low', () => {
  const belowLow = evaluateNavAlert({
    data: [
      { date: '12-11-2026', nav: '98.00' },
      { date: '10-11-2026', nav: '99.00' }
    ]
  });
  assert.equal(belowLow.triggered, false);
  assert.equal(belowLow.matchingDate, null);
});

test('does not match NAV values outside the 60-day window', () => {
  const outsideWindow = evaluateNavAlert({
    data: [
      { date: '12-11-2026', nav: '98.00' },
      { date: '01-09-2026', nav: '90.00' }
    ]
  });

  assert.equal(outsideWindow.triggered, false);
  assert.equal(outsideWindow.matchingDate, null);
});

test('includes the 60-day boundary in the NAV comparison', () => {
  const boundaryMatch = evaluateNavAlert({
    data: [
      { date: '12-11-2026', nav: '100.00' },
      { date: '13-09-2026', nav: '100.00' }
    ]
  });
  assert.equal(boundaryMatch.triggered, true);
  assert.equal(boundaryMatch.matchingDate, '2026-09-13');
});

test('only replaces a saved notification when a new NAV date or value matches', () => {
  const current = { latestNav: 100, latestNavDate: '2026-11-12', isDismissed: false };
  assert.equal(shouldReplaceNavAlert(current, { latestNav: 100, latestDate: '2026-11-12' }), false);
  assert.equal(shouldReplaceNavAlert(current, { latestNav: 100, latestDate: '2026-11-13' }), true);
  assert.equal(shouldReplaceNavAlert(current, { latestNav: 95, latestDate: '2026-11-13' }), true);
  assert.equal(shouldReplaceNavAlert({ ...current, isDemo: true }, { latestNav: 100, latestDate: '2026-11-12' }), true);
  assert.equal(shouldReplaceNavAlert({ ...current, isDemo: true }, { latestNav: 100, latestDate: '2026-11-12' }), true);
  assert.equal(shouldReplaceNavAlert(null, { latestNav: 95 }), true);
});

test('expires the prior notification when a newer NAV date has no 60-day match', () => {
  const current = { latestNavDate: '2026-11-12', isDismissed: false };
  assert.equal(shouldExpireNavAlert(current, {
    triggered: false,
    latestDate: '2026-11-13'
  }), true);
  assert.equal(shouldExpireNavAlert(current, {
    triggered: true,
    latestDate: '2026-11-13'
  }), false);
  assert.equal(shouldExpireNavAlert(current, {
    triggered: false,
    latestDate: '2026-11-12'
  }), false);
  assert.equal(shouldExpireNavAlert({ ...current, isDismissed: true }, {
    triggered: false,
    latestDate: '2026-11-13'
  }), false);
});

test('does not trigger when NAV history is missing or invalid', () => {
  assert.equal(evaluateNavAlert({ data: [] }, 30).triggered, false);
  assert.match(evaluateNavAlert({ data: [{ date: 'invalid', nav: 'x' }] }, 30).reason, /No valid NAV history/);
});
