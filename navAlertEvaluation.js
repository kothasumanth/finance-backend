function parseMfapiDate(value) {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}-\d{4}$/.test(value)) return null;
  const [day, month, year] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

function evaluateNavAlert(history, lookbackDays = 60) {
  const entries = Array.isArray(history?.data)
    ? history.data.map(item => ({
      date: parseMfapiDate(item.date),
      nav: typeof item.nav === 'string' && item.nav.trim() ? Number(item.nav) : Number.NaN
    })).filter(item => item.date && Number.isFinite(item.nav) && item.nav > 0)
    : [];

  if (entries.length === 0) {
    return { triggered: false, reason: 'No valid NAV history is available' };
  }

  entries.sort((a, b) => b.date - a.date);
  const latest = entries[0];
  const cutoff = latest.date.getTime() - lookbackDays * 24 * 60 * 60 * 1000;
  const matchingEntry = entries.find(entry =>
    entry.date < latest.date &&
    entry.date.getTime() >= cutoff &&
    entry.nav === latest.nav
  );

  return {
    triggered: Boolean(matchingEntry),
    latestNav: latest.nav,
    latestDate: latest.date.toISOString().slice(0, 10),
    matchingDate: matchingEntry?.date.toISOString().slice(0, 10) || null
  };
}

function shouldReplaceNavAlert(current, evaluation) {
  return !current ||
    current.isDemo ||
    current.latestNavDate !== evaluation.latestDate ||
    current.latestNav !== evaluation.latestNav;
}

function shouldExpireNavAlert(current, evaluation) {
  return Boolean(
    current &&
    !current.isDismissed &&
    !evaluation.triggered &&
    evaluation.latestDate &&
    current.latestNavDate < evaluation.latestDate
  );
}

module.exports = {
  evaluateNavAlert,
  parseMfapiDate,
  shouldExpireNavAlert,
  shouldReplaceNavAlert
};
