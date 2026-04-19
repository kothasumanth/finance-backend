require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const goldEntryRouter = require('./goldEntry');
const goldPriceRouter = require('./goldPrice');
const User = require('./models/user');
const MutualFundEntry = require('./models/mutualFundEntry');
const MutualFundMetadata = require('./models/mutualFundMetadata');
const PFInterest = require('./pfInterest');
const PFType = require('./pfType');
const PFEntry = require('./pfEntry');
const mfCapTypesRouter = require('./mfCapTypes');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/gold-entries', goldEntryRouter);
app.use('/gold-price', goldPriceRouter);
app.use('/', mfCapTypesRouter);
app.use('/expected-percentages', require('./routes/expectedPercentages'));
app.use('/', require('./sipInfo')); // Add SIP Info routes

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/finance_copilot', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('MongoDB connection error:', err));

// Sample route
app.get('/', (req, res) => {
  res.send('Hello World! Your app is running.');
});

// Get user by ID
app.get('/users/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching user: ' + err.message });
  }
});

// Route to display users as an HTML table
app.get('/users-table', async (req, res) => {
  try {
    const users = await User.find();
    let html = `<h2>Users Table</h2><table border="1" cellpadding="5"><tr><th>_id</th><th>Name</th></tr>`;
    users.forEach(user => {
      html += `<tr><td>${user._id}</td><td>${user.name}</td></tr>`;
    });
    html += `</table>`;
    res.send(html);
  } catch (err) {
    res.status(500).send('Error fetching users: ' + err.message);
  }
});

// Route to return users as JSON for frontend
app.get('/users-table-json', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching users: ' + err.message });
  }
});

// Create a new user (name must be unique, case-insensitive)
app.post('/users', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Missing name' });
    // Check uniqueness case-insensitively
    const existing = await User.findOne({ name: { $regex: `^${name.trim()}$`, $options: 'i' } });
    if (existing) return res.status(400).json({ error: 'User already exists' });
    const newUser = new User({ name: name.trim() });
    await newUser.save();
    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ error: 'Error creating user: ' + err.message });
  }
});

// Get mutual fund entries for a user (populate fundName)
app.get('/mutual-funds/:userId', async (req, res) => {
  try {
    const entries = await MutualFundEntry.find({ userId: req.params.userId }).populate('fundName');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching mutual fund entries: ' + err.message });
  }
});

// Add a new mutual fund entry for a user
app.post('/mutual-funds', async (req, res) => {
  try {
    const { userId, fundName, purchaseDate, investType, amount } = req.body;
    const newEntry = new MutualFundEntry({ userId, fundName, purchaseDate, investType, amount });
    await newEntry.save();
    const populatedEntry = await MutualFundEntry.findById(newEntry._id).populate('fundName');
    res.status(201).json(populatedEntry);
  } catch (err) {
    res.status(500).json({ error: 'Error adding mutual fund entry: ' + err.message });
  }
});

// Update mutual fund entry (allow changing fundName reference)
app.put('/mutual-funds/:id', async (req, res) => {
  try {
    // Accept null values for nav and units
    const updateFields = {};
    if ('fundName' in req.body) updateFields.fundName = req.body.fundName;
    if ('purchaseDate' in req.body) updateFields.purchaseDate = req.body.purchaseDate;
    if ('investType' in req.body) updateFields.investType = req.body.investType;
    if ('amount' in req.body) updateFields.amount = req.body.amount;
    if ('nav' in req.body) updateFields.nav = req.body.nav;
    if ('units' in req.body) updateFields.units = req.body.units;
    if ('isRedeemed' in req.body) updateFields.isRedeemed = req.body.isRedeemed;
    if ('balanceUnit' in req.body) updateFields.balanceUnit = req.body.balanceUnit;

    const updated = await MutualFundEntry.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    ).populate('fundName');
    if (!updated) return res.status(404).json({ error: 'Entry not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Error updating entry: ' + err.message });
  }
});

// Delete mutual fund entry
app.delete('/mutual-funds/:id', async (req, res) => {
  try {
    const deleted = await MutualFundEntry.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting entry: ' + err.message });
  }
});

// Mutual Fund Metadata endpoints
app.get('/mutualfund-metadata', async (req, res) => {
  try {
    const data = await MutualFundMetadata.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching metadata: ' + err.message });
  }
});

app.post('/mutualfund-metadata', async (req, res) => {
  try {
    const { MutualFundName, GoogleValue, ActiveOrPassive, IndexOrManaged, CapType } = req.body;
    const newMeta = new MutualFundMetadata({ MutualFundName, GoogleValue, ActiveOrPassive, IndexOrManaged, CapType });
    await newMeta.save();
    res.status(201).json(newMeta);
  } catch (err) {
    res.status(500).json({ error: 'Error adding metadata: ' + err.message });
  }
});

app.put('/mutualfund-metadata/:id', async (req, res) => {
  try {
    const { MutualFundName, GoogleValue, ActiveOrPassive, IndexOrManaged, CapType } = req.body;
    const updated = await MutualFundMetadata.findByIdAndUpdate(
      req.params.id,
      { MutualFundName, GoogleValue, ActiveOrPassive, IndexOrManaged, CapType },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Metadata not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Error updating metadata: ' + err.message });
  }
});

app.delete('/mutualfund-metadata/:id', async (req, res) => {
  try {
    const deleted = await MutualFundMetadata.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Metadata not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting metadata: ' + err.message });
  }
});

// NAV API endpoint for mutual fund (returns { date, nav } or blanks)
app.get('/mf-api', async (req, res) => {
  const googleValue = req.query.googleValue;
  console.log('\n🔍 [MF-API] Incoming Request:');
  console.log(`   googleValue: ${googleValue}`);
  
  if (!googleValue) {
    console.log('   ❌ Missing googleValue parameter');
    return res.status(400).json({ error: 'Missing googleValue parameter' });
  }
  
  const mfApiUrl = `https://api.mfapi.in/mf/${googleValue}/latest`;
  console.log(`   📡 Fetching from: ${mfApiUrl}`);
  
  try {
    const response = await fetch(mfApiUrl);
    console.log(`   ✅ Response Status: ${response.status}`);
    
    const rawText = await response.text();
    console.log(`   📦 Raw Response:\n${rawText}`);
    
    let data;
    try {
      data = JSON.parse(rawText);
      console.log(`   ✅ Parsed JSON:`, JSON.stringify(data, null, 2));
    } catch (e) {
      console.log(`   ❌ JSON Parse Error: ${e.message}`);
      data = {};
    }
    
    if (data && data.data && data.data.length > 0) {
      console.log(`   ✅ Found data. Date: ${data.data[0].date}, NAV: ${data.data[0].nav}`);
      return res.json({
        date: data.data[0].date || '',
        nav: data.data[0].nav || '',
        mfApiUrl,
        mfApiRawResponse: rawText
      });
    } else {
      console.log(`   ⚠️  No data array found or empty. Returning blank date/nav`);
      return res.json({ date: '', nav: '', mfApiUrl, mfApiRawResponse: rawText });
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return res.json({ date: '', nav: '' });
  }
});

// Endpoint to backfill units for all entries with nav but missing units
app.post('/mutual-funds/backfill-units', async (req, res) => {
  try {
    const entries = await MutualFundEntry.find({ nav: { $exists: true, $ne: null }, $or: [{ units: { $exists: false } }, { units: null }] });
    let updatedCount = 0;
    for (const entry of entries) {
      if (entry.amount && entry.nav) {
        const units = parseFloat((parseFloat(entry.amount) / parseFloat(entry.nav)).toFixed(4));
        entry.units = units;
        await entry.save();
        updatedCount++;
      }
    }
    res.json({ success: true, updated: updatedCount });
  } catch (err) {
    res.status(500).json({ error: 'Error backfilling units: ' + err.message });
  }
});

// ReCal endpoint: match Redeem to Invest entries and update isRedeemed, balanceUnit, principalRedeem, interestRedeem
app.post('/mutual-funds/recal', async (req, res) => {
  try {
    const { userId, fundId } = req.body;
    // Get all entries for this user and fund, sorted by purchaseDate
    const entries = await MutualFundEntry.find({ userId, fundName: fundId }).sort({ purchaseDate: 1 });
    // Only consider Invest and Redeem entries that are not fully redeemed
    let invests = entries.filter(e => e.investType === 'Invest' && !e.isRedeemed && (e.balanceUnit === undefined || e.balanceUnit > 0));
    let redeems = entries.filter(e => e.investType === 'Redeem' && !e.isRedeemed && (e.balanceUnit === undefined || e.balanceUnit > 0));
    // Set up balanceUnit for all invests if not set
    for (const invest of invests) {
      if (typeof invest.balanceUnit !== 'number' || isNaN(invest.balanceUnit)) {
        invest.balanceUnit = invest.units || 0;
        await invest.save();
      }
    }
    // Main matching logic
    for (const invest of invests) {
      let investUnitsLeft = invest.balanceUnit || 0;
      let principalRedeem = invest.principalRedeem || 0;
      let interestRedeem = invest.interestRedeem || 0;
      for (const redeem of redeems) {
        if (investUnitsLeft <= 0) break;
        if (redeem.balanceUnit <= 0) continue;
        // How many units can we match?
        const matchUnits = Math.min(investUnitsLeft, redeem.balanceUnit);
        // principalRedeem += matchUnits * invest.nav
        // interestRedeem += matchUnits * (redeem.nav - invest.nav)
        const investNav = invest.nav || 0;
        const redeemNav = redeem.nav || 0;
        principalRedeem += matchUnits * investNav;
        interestRedeem += matchUnits * (redeemNav - investNav);
        investUnitsLeft -= matchUnits;
        redeem.balanceUnit -= matchUnits;
      }
      // Update only if changed
      await MutualFundEntry.findByIdAndUpdate(invest._id, { $set: { principalRedeem, interestRedeem, balanceUnit: investUnitsLeft, isRedeemed: investUnitsLeft <= 0 } });
    }
    // After matching, update isRedeemed and balanceUnit for all redeems
    for (const redeem of redeems) {
      await MutualFundEntry.findByIdAndUpdate(redeem._id, { $set: { balanceUnit: redeem.balanceUnit, isRedeemed: redeem.balanceUnit <= 0 } });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error in ReCal: ' + err.message });
  }
});

// Force update all entries for a user and fund: set nav and units to null
app.post('/mutual-funds/force-null', async (req, res) => {
  try {
    const { userId, fundId } = req.body;
    await MutualFundEntry.updateMany(
      { userId, fundName: fundId },
      { $set: { nav: null, units: null, isRedeemed: false, balanceUnit: null, principalRedeem: 0, interestRedeem: 0 } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error force null: ' + err.message });
  }
});

// PF Interest endpoints
app.get('/pf-interest', async (req, res) => {
  try {
    const data = await PFInterest.find().sort({ startDate: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching PF interest: ' + err.message });
  }
});

app.post('/pf-interest', async (req, res) => {
  try {
    const { startDate, endDate, rateOfInterest, pfType } = req.body;
    const newRow = new PFInterest({ startDate, endDate, rateOfInterest, pfType });
    await newRow.save();
    res.status(201).json(newRow);
  } catch (err) {
    res.status(500).json({ error: 'Error adding PF interest: ' + err.message });
  }
});

app.put('/pf-interest/:id', async (req, res) => {
  try {
    const { startDate, endDate, rateOfInterest, pfType } = req.body;
    const updated = await PFInterest.findByIdAndUpdate(
      req.params.id,
      { $set: { startDate, endDate, rateOfInterest, pfType } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Entry not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Error updating PF interest: ' + err.message });
  }
});

app.delete('/pf-interest/:id', async (req, res) => {
  try {
    const deleted = await PFInterest.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting PF interest: ' + err.message });
  }
});

// PF Types endpoints
app.get('/pf-types', async (req, res) => {
  try {
    const types = await PFType.find();
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching PF types: ' + err.message });
  }
});

app.post('/pf-types/seed', async (req, res) => {
  try {
    const types = ['PF', 'PPF', 'VPF'];
    const inserted = await PFType.insertMany(
      types.map(name => ({ name })),
      { ordered: false }
    ).catch(() => []); // ignore duplicate errors
    res.json({ success: true, inserted });
  } catch (err) {
    res.status(500).json({ error: 'Error seeding PF types: ' + err.message });
  }
});

// Bulk create PPF entries for a user for 15 years from a start date
app.post('/pfentry/ppf-bulk-create', async (req, res) => {
  try {
    const { userId, pfTypeId, startDate } = req.body;
    // Check if pfentries collection exists
    const collections = await mongoose.connection.db.listCollections({ name: 'pfentries' }).toArray();
    if (collections.length === 0) {
      // Create collection by inserting a dummy and deleting it
      const dummy = await PFEntry.create({
        userId,
        pfTypeId,
        date: new Date(),
        pfInterestId: (await PFInterest.findOne())?._id || new mongoose.Types.ObjectId(),
        monthInterest: 0
      });
      await PFEntry.deleteOne({ _id: dummy._id });
    }
    // Now check for existing entries (force count, not findOne)
    const count = await PFEntry.countDocuments({ userId, pfTypeId });
    if (count > 0) return res.status(400).json({ error: 'PPF entries already exist for this user.' });
    // --- Robust month increment logic ---
    let start = new Date(startDate);
    // Always use the 1st of the month for the start date
    start = new Date(start.getFullYear(), start.getMonth(), 1);
    // If start month is before April, adjust to April 1 of that year
    if (start.getMonth() < 3) {
      start = new Date(start.getFullYear(), 3, 1);
    }
    const startYear = start.getFullYear();
    const startMonth = start.getMonth();
    const entries = [];
    let prevBalance = 0;
    for (let i = 0; i < 180; i++) { // 15 years * 12 months
      const year = startYear + Math.floor((startMonth + i) / 12);
      const month = (startMonth + i) % 12;
      const entryDate = new Date(Date.UTC(year, month, 1)); // always 1st of month, UTC
      // Prefer PFInterest rows that match the provided pfTypeId (ensures PF vs PPF rates)
      const pfInterest = await PFInterest.findOne({
        startDate: { $lte: entryDate },
        endDate: { $gte: entryDate },
        pfType: pfTypeId
      });
      // Calculate lowestBalance
      let amountDeposited = 0; // default for bulk create
      let day = 1; // always 1st for bulk create
      let lowestBalance = 0;
      if (i === 0) {
        lowestBalance = 0; // first record
      } else {
        if (day > 5) {
          lowestBalance = prevBalance;
        } else {
          lowestBalance = prevBalance + amountDeposited;
        }
      }
      // Calculate balance
      let balance = 0;
      if (day > 5) {
        balance = lowestBalance + amountDeposited;
      } else {
        balance = lowestBalance;
      }
      entries.push({
        userId,
        pfTypeId,
        date: entryDate,
        monthInterest: 0,
        pfInterestId: pfInterest ? pfInterest._id : null,
        amountDeposited,
        lowestBalance,
        balance
      });
      prevBalance = balance;
    }
    const result = await PFEntry.insertMany(entries);
    res.json({ success: true, count: result.length });
  } catch (err) {
    res.status(500).json({ error: 'Error bulk creating PPF entries: ' + err.message });
  }
});

// Bulk create PF entries for a user for 15 years from a start date (generic for any PF type)
app.post('/pfentry/pf-bulk-create', async (req, res) => {
  try {
    const { userId, pfTypeId, startDate } = req.body;
    // Check if pfentries collection exists
    const collections = await mongoose.connection.db.listCollections({ name: 'pfentries' }).toArray();
    if (collections.length === 0) {
      // Create collection by inserting a dummy and deleting it
      const dummy = await PFEntry.create({
        userId,
        pfTypeId,
        date: new Date(),
        pfInterestId: (await PFInterest.findOne())?._id || new mongoose.Types.ObjectId(),
        monthInterest: 0
      });
      await PFEntry.deleteOne({ _id: dummy._id });
    }
    // Now check for existing entries (force count, not findOne)
    const count = await PFEntry.countDocuments({ userId, pfTypeId });
    if (count > 0) return res.status(400).json({ error: 'PF entries already exist for this user and type.' });
    // --- Robust month increment logic ---
    let start = new Date(startDate);
    // Always use the 1st of the month for the start date
    start = new Date(start.getFullYear(), start.getMonth(), 1);
    // If start month is before April, adjust to April 1 of that year
    if (start.getMonth() < 3) {
      start = new Date(start.getFullYear(), 3, 1);
    }
    const startYear = start.getFullYear();
    const startMonth = start.getMonth();
    const entries = [];
    let prevBalance = 0;
    for (let i = 0; i < 180; i++) { // 15 years * 12 months
      const year = startYear + Math.floor((startMonth + i) / 12);
      const month = (startMonth + i) % 12;
      const entryDate = new Date(Date.UTC(year, month, 1)); // always 1st of month, UTC
      // Prefer PFInterest rows that match the provided pfTypeId (ensures PF vs PPF rates)
      const pfInterest = await PFInterest.findOne({
        startDate: { $lte: entryDate },
        endDate: { $gte: entryDate },
        pfType: pfTypeId
      });
      // Calculate lowestBalance
      let amountDeposited = 0; // default for bulk create
      let day = 1; // always 1st for bulk create
      let lowestBalance = 0;
      if (i === 0) {
        lowestBalance = 0; // first record
      } else {
        if (day > 5) {
          lowestBalance = prevBalance;
        } else {
          lowestBalance = prevBalance + amountDeposited;
        }
      }
      // Calculate balance
      let balance = 0;
      if (day > 5) {
        balance = lowestBalance + amountDeposited;
      } else {
        balance = lowestBalance;
      }
      entries.push({
        userId,
        pfTypeId,
        date: entryDate,
        monthInterest: 0,
        pfInterestId: pfInterest ? pfInterest._id : null,
        amountDeposited,
        lowestBalance,
        balance
      });
      prevBalance = balance;
    }
    const result = await PFEntry.insertMany(entries);
    res.json({ success: true, count: result.length });
  } catch (err) {
    res.status(500).json({ error: 'Error bulk creating PF entries: ' + err.message });
  }
});

// Get pfentries for user and pfTypeId
app.get('/pfentry/user/:userId/type/:pfTypeId', async (req, res) => {
  try {
    const entries = await PFEntry.find({ userId: req.params.userId, pfTypeId: req.params.pfTypeId });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching pfentries: ' + err.message });
  }
});

// Endpoint to force-create pfentries collection
app.post('/pfentry/create-collection', async (req, res) => {
  try {
    // Use a valid pfInterestId for schema
    const pfInterest = await PFInterest.findOne();
    if (!pfInterest) return res.status(400).json({ error: 'No PFInterest found. Please create at least one PFInterest record first.' });
    const dummy = await PFEntry.create({
      userId: new mongoose.Types.ObjectId(),
      pfTypeId: new mongoose.Types.ObjectId(),
      date: new Date(),
      pfInterestId: pfInterest._id,
      monthInterest: 0
    });
    await PFEntry.deleteOne({ _id: dummy._id });
    res.json({ success: true, message: 'pfentries collection created.' });
  } catch (err) {
    res.status(500).json({ error: 'Error creating pfentries collection: ' + err.message });
  }
});

// Delete all pfentries for user and pfTypeId
app.delete('/pfentry/user/:userId/type/:pfTypeId', async (req, res) => {
  try {
    const result = await PFEntry.deleteMany({ userId: req.params.userId, pfTypeId: req.params.pfTypeId });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting pfentries: ' + err.message });
  }
});

// Update a PFEntry (date, amountDeposited, monthInterest)
app.put('/pfentry/:id', async (req, res) => {
  try {
    const { date, amountDeposited, monthInterest } = req.body;
    // Find the entry to update
    const entry = await PFEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    // Update the entry with new values
    if (date) entry.date = date;
  if (amountDeposited !== undefined) entry.amountDeposited = amountDeposited;
  if (monthInterest !== undefined) entry.monthInterest = Number(Number(monthInterest).toFixed(2));
    await entry.save();
    // Get all entries for this user and pfTypeId, sorted by date
    const allEntries = await PFEntry.find({ userId: entry.userId, pfTypeId: entry.pfTypeId }).sort({ date: 1 });
    // Find the index of the edited entry
    const idx = allEntries.findIndex(e => e._id.toString() === entry._id.toString());
    // Recalculate lowestBalance and balance from the edited entry onwards
    let prevBalance = idx > 0 ? allEntries[idx - 1].balance || 0 : 0;
    for (let i = idx; i < allEntries.length; i++) {
      const e = allEntries[i];
      // Use the possibly updated values for the edited entry
      const d = new Date(i === idx && date ? date : e.date);
      const day = d.getUTCDate();
      // Use the possibly updated amountDeposited for the edited entry
      const amt = i === idx && amountDeposited !== undefined ? amountDeposited : e.amountDeposited;
      let lowestBalance = 0;
      if (i === 0) {
        lowestBalance = 0;
      } else {
        if (day > 5) {
          lowestBalance = prevBalance;
        } else {
          lowestBalance = prevBalance + amt;
        }
      }
      // If this is an April entry, add sum of last year's monthly interests
      if (d.getUTCMonth() === 3) { // April is month 3 (0-based)
        // Find all entries in the previous April-March period
        const currentYear = d.getUTCFullYear();
        const lastApril = new Date(Date.UTC(currentYear - 1, 3, 1));
        const thisMarch = new Date(Date.UTC(currentYear, 2, 31, 23, 59, 59, 999));
        // Sum monthInterest for all entries in that period
        const lastYearInterests = allEntries.filter(e2 => {
          const ed = new Date(e2.date);
          return ed >= lastApril && ed <= thisMarch;
        }).reduce((sum, e2) => sum + (typeof e2.monthInterest === 'number' ? e2.monthInterest : 0), 0);
        lowestBalance += lastYearInterests;
      }
      let balance = 0;
      if (day > 5) {
        balance = lowestBalance + amt;
      } else {
        balance = lowestBalance;
      }
      e.lowestBalance = lowestBalance;
      e.balance = balance;
      // If this is the edited entry, update date and amountDeposited if changed
      if (i === idx) {
        if (date) e.date = date;
        if (amountDeposited !== undefined) e.amountDeposited = amountDeposited;
        if (monthInterest !== undefined) e.monthInterest = Number(Number(monthInterest).toFixed(2));
      }
      // Recalculate monthInterest using lowestBalance and ROI
      let roi = 0;
      // Find PFInterest for this entry's date that matches its pfTypeId (ensures PF vs PPF selection)
      try {
        const pfInterestForDate = await PFInterest.findOne({
          startDate: { $lte: d },
          endDate: { $gte: d },
          pfType: e.pfTypeId
        });
        if (pfInterestForDate && pfInterestForDate.rateOfInterest) {
          roi = pfInterestForDate.rateOfInterest;
          // ensure the entry references the correct PFInterest
          e.pfInterestId = pfInterestForDate._id;
        } else {
          // if no matching PFInterest, clear the reference so we don't accidentally use wrong rates
          e.pfInterestId = undefined;
        }
      } catch (err) {
        // leave roi as 0 on error
      }
  // Save monthInterest as float with 2 decimal places
  e.monthInterest = Number(((lowestBalance * roi) / 1200).toFixed(2));
      await e.save();
      prevBalance = balance;
    }
    // Return all updated entries for UI refresh
    const updatedEntries = await PFEntry.find({ userId: entry.userId, pfTypeId: entry.pfTypeId });
    res.json({ success: true, updatedEntries });
  } catch (err) {
    res.status(500).json({ error: 'Error updating pfentry: ' + err.message });
  }
});

// Recalculate all PF entries for all users and PF types
app.post('/pfentry/recalculate-all', async (req, res) => {
  try {
    // Allow optional restriction to a single pfTypeId to avoid mixing PF/PPF runs
    const requestedPfTypeId = (req.body && req.body.pfTypeId) || req.query.pfTypeId || null;
    let pfTypes;
    if (requestedPfTypeId) {
      const single = await PFType.findById(requestedPfTypeId);
      if (!single) return res.status(400).json({ error: 'Invalid pfTypeId provided' });
      pfTypes = [single];
    } else {
      pfTypes = await PFType.find();
    }
    const users = await User.find();
    let totalUpdated = 0;
    for (const pfType of pfTypes) {
      for (const user of users) {
        const allEntries = await PFEntry.find({ userId: user._id, pfTypeId: pfType._id }).sort({ date: 1 });
        if (!allEntries.length) continue;
        let prevBalance = 0;
        for (let i = 0; i < allEntries.length; i++) {
          const e = allEntries[i];
          const d = new Date(e.date);
          const day = d.getUTCDate();
          const amt = e.amountDeposited;
          // Find correct PFInterest for this entry's date
          // Find PFInterest matching date and pfType for this entry
          // Try to find a PFInterest that covers this date for the pfType.
          // Use a robust lookup with fallbacks in case of timezone/precision issues or slightly mismatched ranges.
          let pfInterest = await PFInterest.findOne({
            startDate: { $lte: d },
            endDate: { $gte: d },
            pfType: pfType._id
          });

          if (!pfInterest) {
            // Fallback: fetch all PFInterest rows for this pfType and match by normalized date (UTC midnight)
            const candidates = await PFInterest.find({ pfType: pfType._id }).sort({ startDate: -1 });
            const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
            for (const cand of candidates) {
              try {
                const s = new Date(cand.startDate);
                const e = new Date(cand.endDate);
                const sNorm = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
                const eNorm = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()));
                if (target >= sNorm && target <= eNorm) {
                  pfInterest = cand;
                  break;
                }
              } catch (err) {
                // ignore parse errors and continue
              }
            }
          }

          if (!pfInterest) {
            // As an extra fallback, try to pick the most recent PFInterest whose startDate is <= target date
            const fallback = await PFInterest.findOne({ pfType: pfType._id, startDate: { $lte: d } }).sort({ startDate: -1 });
            if (fallback) pfInterest = fallback;
          }

          if (!pfInterest) {
            throw new Error(`No PFInterest found for entry date ${d.toISOString().slice(0,10)} (user: ${user._id}, pfType: ${pfType._id})`);
          }
          let roi = 0;
          if (pfInterest && pfInterest.rateOfInterest) {
            roi = pfInterest.rateOfInterest;
            e.pfInterestId = pfInterest._id;
          } else {
            e.pfInterestId = undefined;
          }
          let lowestBalance = 0;
          if (i === 0) {
            lowestBalance = 0;
          } else {
            if (day > 5) {
              lowestBalance = prevBalance;
            } else {
              lowestBalance = prevBalance + amt;
            }
          }
          // If this is an April entry, add sum of last year's monthly interests
          if (d.getUTCMonth() === 3) { // April is month 3 (0-based)
            const currentYear = d.getUTCFullYear();
            const lastApril = new Date(Date.UTC(currentYear - 1, 3, 1));
            const thisMarch = new Date(Date.UTC(currentYear, 2, 31, 23, 59, 59, 999));
            const lastYearInterests = allEntries.filter(e2 => {
              const ed = new Date(e2.date);
              return ed >= lastApril && ed <= thisMarch;
            }).reduce((sum, e2) => sum + (typeof e2.monthInterest === 'number' ? e2.monthInterest : 0), 0);
            lowestBalance += lastYearInterests;
          }
          let balance = 0;
          if (day > 5) {
            balance = lowestBalance + amt;
          } else {
            balance = lowestBalance;
          }
          e.lowestBalance = lowestBalance;
          e.balance = balance;
          // Save monthInterest as float with 2 decimal places
          e.monthInterest = Number(((lowestBalance * roi) / 1200).toFixed(2));
          await e.save();
          prevBalance = balance;
          totalUpdated++;
        }
      }
    }
    res.json({ success: true, totalUpdated });
  } catch (err) {
    res.status(500).json({ error: 'Error recalculating all pfentries: ' + err.message });
  }
});

// Get NAV data for a specific mutual fund (last 30 days from today)
app.get('/mf-nav/:userId/:fundName', async (req, res) => {
  try {
    const { userId, fundName } = req.params;
    const decodedFundName = decodeURIComponent(fundName);
    
    console.log(`\n🔍 [MF-NAV] Fetching NAV for: "${decodedFundName}"`);
    
    // Find the mutual fund metadata by name to get GoogleValue
    const metadata = await MutualFundMetadata.findOne({ MutualFundName: decodedFundName });
    
    let googleValue = null;
    if (metadata && metadata.GoogleValue) {
      googleValue = metadata.GoogleValue;
      console.log(`✅ Found metadata with GoogleValue: ${googleValue}`);
    } else {
      console.log(`⚠️  No metadata found in DB, will try to search by name in API`);
    }
    
    if (!googleValue) {
      console.log(`❌ No GoogleValue found. Cannot fetch NAV data.`);
      return res.status(400).json({ 
        error: 'GoogleValue not configured for this mutual fund',
        suggestion: 'Please add the mutual fund metadata with GoogleValue from mfapi.in'
      });
    }
    
    console.log(`📡 Fetching from mfapi.in with GoogleValue: ${googleValue}`);
    
    // Fetch NAV data from mfapi.in
    const mfApiUrl = `https://api.mfapi.in/mf/${googleValue}`;
    console.log(`   URL: ${mfApiUrl}`);
    
    const response = await fetch(mfApiUrl);
    
    if (!response.ok) {
      console.log(`❌ API returned status: ${response.status}`);
      return res.status(500).json({ 
        error: `API error: ${response.status}`,
        mfApiUrl 
      });
    }
    
    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      console.log(`⚠️  No data array in API response`);
      return res.json([]);
    }
    
    console.log(`✅ Received ${data.data.length} total NAV records from API`);
    console.log(`   First record: ${JSON.stringify(data.data[0])}`);
    console.log(`   Last record: ${JSON.stringify(data.data[data.data.length - 1])}`);
    
    // Calculate 30 days ago from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    console.log(`📅 Filtering from ${thirtyDaysAgo.toLocaleDateString()} to ${today.toLocaleDateString()}`);
    
    // Parse and filter NAV data for last 30 days
    const filteredData = [];
    
    for (const item of data.data) {
      if (!item.date) continue;
      
      try {
        // Parse date format: DD-MM-YYYY (e.g., "02-04-2026" for April 2, 2026)
        const dateParts = item.date.trim().split('-');
        if (dateParts.length !== 3) {
          console.log(`   ⚠️  Skipping invalid date format: "${item.date}"`);
          continue;
        }
        
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed in JavaScript
        const year = parseInt(dateParts[2], 10);
        
        if (isNaN(day) || isNaN(month + 1) || isNaN(year)) {
          console.log(`   ⚠️  Invalid date components: "${item.date}"`);
          continue;
        }
        
        const itemDate = new Date(year, month, day);
        itemDate.setHours(0, 0, 0, 0);
        
        // Check if date is within last 30 days
        if (itemDate >= thirtyDaysAgo && itemDate <= today) {
          // Convert back to DD-MMM-YYYY format for display
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const displayDate = `${String(day).padStart(2, '0')}-${monthNames[month]}-${year}`;
          
          filteredData.push({
            date: displayDate,
            nav: item.nav,
            originalDate: item.date
          });
        }
      } catch (err) {
        console.log(`   ⚠️  Error parsing date item: ${item.date}`, err.message);
        continue;
      }
    }
    
    console.log(`✅ Filtered to ${filteredData.length} records from last 30 days`);
    
    if (filteredData.length === 0) {
      console.log(`⚠️  No data found in last 30 days`);
    }
    
    // Sort by date (oldest first)
    filteredData.sort((a, b) => {
      const [aDay, aMonthStr, aYear] = a.date.split('-');
      const [bDay, bMonthStr, bYear] = b.date.split('-');
      
      const monthMap = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      };
      
      const aDate = new Date(parseInt(aYear), monthMap[aMonthStr], parseInt(aDay));
      const bDate = new Date(parseInt(bYear), monthMap[bMonthStr], parseInt(bDay));
      
      return aDate - bDate;
    });
    
    // Remove the originalDate field before sending to frontend
    const finalData = filteredData.map(({ originalDate, ...rest }) => rest);
    
    res.json(finalData);
  } catch (err) {
    console.error('❌ Error fetching NAV data:', err.message);
    console.error(err.stack);
    res.status(500).json({ 
      error: 'Error fetching NAV data: ' + err.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
