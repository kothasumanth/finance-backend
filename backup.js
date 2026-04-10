require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const backupDir = path.join(__dirname, 'DBData_Backup');

// Ensure backup directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

async function backup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/finance_copilot', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('MongoDB connected for backup\n');

    // Get all collections from the database
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name).filter(name => !name.startsWith('system.'));
    
    console.log(`Found ${collectionNames.length} collections to backup:\n`);
    
    let totalDocuments = 0;
    for (const col of collectionNames) {
      try {
        const data = await mongoose.connection.collection(col).find({}).toArray();
        const filePath = path.join(backupDir, `${col}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`✓ Backed up ${col} (${data.length} documents)`);
        totalDocuments += data.length;
      } catch (err) {
        console.error(`✗ Failed to backup ${col}:`, err.message);
      }
    }
    
    // Create a backup metadata file with timestamp
    const metadata = {
      timestamp: new Date().toISOString(),
      totalCollections: collectionNames.length,
      totalDocuments: totalDocuments,
      collections: collectionNames
    };
    fs.writeFileSync(path.join(backupDir, '_backup_metadata.json'), JSON.stringify(metadata, null, 2));
    
    console.log('\n✓ Backup complete!');
    console.log(`  Total collections: ${collectionNames.length}`);
    console.log(`  Total documents: ${totalDocuments}`);
    console.log(`  Timestamp: ${metadata.timestamp}`);
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Backup failed:', err.message);
    process.exit(1);
  }
}

backup();
