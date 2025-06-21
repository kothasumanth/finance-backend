require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const User = require('./user');

const app = express();
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
