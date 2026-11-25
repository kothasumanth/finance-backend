function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function findApplicablePFInterest(interestRows, pfTypeId, date) {
  const targetDate = normalizeDate(date);
  if (!targetDate) return null;

  const applicableRows = interestRows
    .filter(row => String(row.pfType) === String(pfTypeId))
    .map(row => ({
      row,
      startDate: normalizeDate(row.startDate),
      endDate: normalizeDate(row.endDate)
    }))
    .filter(row => row.startDate && row.startDate <= targetDate)
    .sort((a, b) => b.startDate - a.startDate);

  return applicableRows.find(row => row.endDate && row.endDate >= targetDate)?.row
    || applicableRows[0]?.row
    || null;
}

module.exports = findApplicablePFInterest;
