require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/user');
const MutualFundEntry = require('./models/mutualFundEntry');
const MutualFundMetadata = require('./models/mutualFundMetadata');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

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
    const { MutualFundName, GoogleValue } = req.body;
    const newMeta = new MutualFundMetadata({ MutualFundName, GoogleValue });
    await newMeta.save();
    res.status(201).json(newMeta);
  } catch (err) {
    res.status(500).json({ error: 'Error adding metadata: ' + err.message });
  }
});

app.put('/mutualfund-metadata/:id', async (req, res) => {
  try {
    const { MutualFundName, GoogleValue } = req.body;
    const updated = await MutualFundMetadata.findByIdAndUpdate(
      req.params.id,
      { MutualFundName, GoogleValue },
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
  if (!googleValue) {
    return res.status(400).json({ error: 'Missing googleValue parameter' });
  }
  const mfApiUrl = `https://api.mfapi.in/mf/${googleValue}/latest`;
  try {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const response = await fetch(mfApiUrl);
    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      data = {};
    }
    if (data && data.data && data.data.length > 0) {
      return res.json({
        date: data.data[0].date || '',
        nav: data.data[0].nav || '',
        mfApiUrl,
        mfApiRawResponse: rawText
      });
    } else {
      return res.json({ date: '', nav: '', mfApiUrl, mfApiRawResponse: rawText });
    }
  } catch (err) {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
