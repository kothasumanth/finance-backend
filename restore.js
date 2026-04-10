require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const backupDir = path.join(__dirname, 'DBData_Backup');

async function restore() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/finance_copilot', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('MongoDB connected for restore\n');

    // Get all backup files
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
    
    console.log(`Found ${files.length} backup files to restore:\n`);
    
    for (const file of files) {
      const col = file.replace('.json', '');
      const filePath = path.join(backupDir, file);
      
      try {
        let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Convert ALL string IDs to ObjectIds
        // This handles: _id, userId, fundName, pfTypeId, pfInterestId, mfMetadataId, etc.
        data = data.map(doc => {
          const newDoc = { ...doc };
          
          // Helper function to convert a field if it's a valid ObjectId string
          const convertId = (field) => {
            if (typeof newDoc[field] === 'string' && newDoc[field].match(/^[0-9a-f]{24}$/i)) {
              newDoc[field] = new mongoose.Types.ObjectId(newDoc[field]);
            }
          };
          
          // Convert all potential ID fields in all collections
          convertId('_id');
          convertId('userId');
          convertId('fundName');
          convertId('pfTypeId');
          convertId('pfInterestId');
          convertId('mfMetadataId');
          
          return newDoc;
        });
        
        // Clear existing collection
        await mongoose.connection.collection(col).deleteMany({});
        
        // Insert backup data if any exists
        if (data && data.length > 0) {
          await mongoose.connection.collection(col).insertMany(data);
          console.log(`✓ Restored ${col} (${data.length} documents)`);
        } else {
          console.log(`✓ Cleared ${col} (no data to restore)`);
        }
      } catch (err) {
        console.error(`✗ Failed to restore ${col}:`, err.message);
      }
    }
    
    console.log('\n✓ Restore complete!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Restore failed:', err.message);
    process.exit(1);
  }
}

restore();
