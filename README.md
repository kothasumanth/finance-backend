# Finance Copilot

This is a Node.js + Express.js web application with MongoDB integration. It is designed to run locally and can be easily deployed to the cloud.

## Getting Started

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Set up your environment variables in the `.env` file.
3. Start MongoDB (it should auto-start on most systems).
4. Start the server:
   ```powershell
   node index.js
   ```
5. Open your browser and go to `http://localhost:3000`.

## Database Setup

### Local Development (No Passwords)
The database runs locally without authentication:
- **Connection String**: `mongodb://localhost:27017/finance_copilot`
- **No username/password required**
- MongoDB automatically creates the `finance_copilot` database on first connection
- Collections are created automatically as you add data

### First Time Setup on New Laptop
1. Install MongoDB Community Edition
2. Clone/copy the project
3. Run `npm install`
4. Start MongoDB service
5. Run `node index.js` - the database and collections will be created automatically

## Backup & Restore

### Create a Backup
Backs up all 12 database collections to JSON files in `DBData_Backup/` folder:
```powershell
npm run backup
```

**Output includes:**
- Timestamp of backup
- Total collections backed up
- Total documents backed up
- Metadata file for reference

### Restore from Backup
Restores all collections from `DBData_Backup/` folder:
```powershell
npm run restore
```

⚠️ **Warning**: This **deletes all current data** and restores from backup. Use with caution!

**Features:**
- Automatically converts all MongoDB ObjectIds correctly
- Links users with their mutual funds, PPF, PF, and other data properly
- Zero data loss after restore

### Backup Safety
- ✅ Backup files are in `.gitignore` - they won't be committed to GitHub
- ✅ Contains personal/financial data - keep locally or encrypted
- ✅ Recommended: Store backups on your local machine or encrypted cloud storage

### Recommended Backup Workflow
```powershell
# Before making major changes
npm run backup

# After testing/verification, if issues found:
npm run restore
```

## Cloud Deployment
- Update the `MONGODB_URI` in `.env` to use a cloud MongoDB provider (e.g., MongoDB Atlas).
- For cloud MongoDB with authentication, update `.env`:
  ```
  MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/finance_copilot
  ```
- Deploy to your preferred cloud platform (Heroku, Azure, AWS, etc.).

## Project Structure
```
finance-backend/
├── models/              # MongoDB schemas
├── routes/              # API routes
├── DBData_Backup/       # Backup files (not in git)
├── backup.js           # Backup script
├── restore.js          # Restore script
├── index.js            # Main server file
├── .env                # Environment variables
└── package.json
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run backup` | Create database backup |
| `npm run restore` | Restore from backup |
| `node index.js` | Start server |

## License
MIT
