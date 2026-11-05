function parseSetupDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function monthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

async function setupPFPeriods({ PFEntry, PFInterest, mongoose }, { userId, pfTypeId, startDate, endDate }) {
  if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(pfTypeId)) {
    const error = new Error('A valid user and PF type are required.');
    error.status = 400;
    throw error;
  }

  const existingEntries = await PFEntry.find({ userId, pfTypeId }).sort({ date: 1 });
  let firstPeriod;
  let lastPeriod;

  if (existingEntries.length) {
    firstPeriod = monthStart(new Date(existingEntries[0].date));
    lastPeriod = monthStart(new Date(existingEntries[existingEntries.length - 1].date));
  } else {
    const parsedStart = parseSetupDate(startDate);
    if (!parsedStart) {
      const error = new Error('A valid start date is required to create periods.');
      error.status = 400;
      throw error;
    }
    firstPeriod = monthStart(parsedStart);
    if (firstPeriod.getUTCMonth() < 3) firstPeriod = new Date(Date.UTC(firstPeriod.getUTCFullYear(), 3, 1));
  }

  const parsedEnd = endDate ? parseSetupDate(endDate) : null;
  if (endDate && !parsedEnd) {
    const error = new Error('A valid end date is required.');
    error.status = 400;
    throw error;
  }
  const targetEnd = parsedEnd
    ? monthStart(parsedEnd)
    : existingEntries.length
      ? lastPeriod
      : addMonths(firstPeriod, 179);

  if (targetEnd < firstPeriod) {
    const error = new Error('The end date must be in or after the first period.');
    error.status = 400;
    throw error;
  }

  let deletedCount = 0;
  if (targetEnd < lastPeriod) {
    const firstRemovedPeriod = addMonths(targetEnd, 1);
    const periodsToRemove = existingEntries.filter(entry => new Date(entry.date) >= firstRemovedPeriod);
    const depositedPeriods = periodsToRemove
      .filter(entry => Number(entry.amountDeposited || 0) !== 0)
      .map(entry => ({
        date: new Date(entry.date).toISOString().slice(0, 10),
        amountDeposited: entry.amountDeposited
      }));

    if (depositedPeriods.length) {
      const error = new Error('Set the deposits in the periods being removed to 0 before reducing the end date.');
      error.status = 409;
      error.periods = depositedPeriods;
      throw error;
    }

    const deletion = await PFEntry.deleteMany({
      userId,
      pfTypeId,
      date: { $gte: firstRemovedPeriod }
    });
    deletedCount = deletion.deletedCount;
  }

  const periodsToAdd = [];
  let previousBalance = existingEntries.length
    ? Number(existingEntries[existingEntries.length - 1].balance) || 0
    : 0;
  let nextPeriod = existingEntries.length ? addMonths(lastPeriod, 1) : firstPeriod;

  while (nextPeriod <= targetEnd) {
    const pfInterest = await PFInterest.findOne({
      startDate: { $lte: nextPeriod },
      endDate: { $gte: nextPeriod },
      pfType: pfTypeId
    });
    const amountDeposited = 0;
    periodsToAdd.push({
      userId,
      pfTypeId,
      date: nextPeriod,
      monthInterest: 0,
      pfInterestId: pfInterest ? pfInterest._id : null,
      amountDeposited,
      lowestBalance: previousBalance,
      balance: previousBalance
    });
    nextPeriod = addMonths(nextPeriod, 1);
  }

  const addedEntries = periodsToAdd.length ? await PFEntry.insertMany(periodsToAdd) : [];
  return {
    success: true,
    count: addedEntries.length,
    createdCount: addedEntries.length,
    deletedCount,
    startDate: firstPeriod.toISOString().slice(0, 10),
    endDate: targetEnd.toISOString().slice(0, 10)
  };
}

module.exports = setupPFPeriods;
