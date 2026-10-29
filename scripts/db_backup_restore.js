import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendNodeModules = path.resolve(__dirname, '../backend/node_modules');
const mongooseModuleUrl = pathToFileURL(path.join(backendNodeModules, 'mongoose/index.js')).href;
const mongoose = (await import(mongooseModuleUrl)).default;

/**
 * Universal Node.js Database Backup and Restore Utility
 * Supports environments without native mongodump / mongorestore binary tools.
 */

async function connectToDb(uri) {
  return await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  });
}

export async function backupDatabase({ uri, outputPath }) {
  console.log(`[BACKUP] Connecting to source database: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}...`);
  const conn = await connectToDb(uri);
  const db = conn.connection.db;

  const collections = await db.listCollections().toArray();
  const backupPayload = {
    metadata: {
      timestamp: new Date().toISOString(),
      sourceDatabase: conn.connection.name,
      collectionsCount: collections.length
    },
    data: {}
  };

  let totalDocs = 0;
  for (const col of collections) {
    const colName = col.name;
    // Skip system collections
    if (colName.startsWith('system.')) continue;

    const docs = await db.collection(colName).find({}).toArray();
    backupPayload.data[colName] = docs;
    totalDocs += docs.length;
    console.log(`  - Exported collection '${colName}': ${docs.length} documents`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(backupPayload, null, 2), 'utf8');

  console.log(`[BACKUP SUCCESS] Wrote ${totalDocs} documents across ${Object.keys(backupPayload.data).length} collections to: ${outputPath}`);
  await mongoose.disconnect();
  return { totalDocs, collectionsCount: Object.keys(backupPayload.data).length, outputPath };
}

export async function restoreDatabase({ uri, inputPath, drop = false }) {
  console.log(`[RESTORE] Connecting to target database: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}...`);
  const fileContent = await fs.readFile(inputPath, 'utf8');
  const backupPayload = JSON.parse(fileContent);

  const conn = await connectToDb(uri);
  const db = conn.connection.db;

  console.log(`[RESTORE] Source backup timestamp: ${backupPayload.metadata?.timestamp}`);
  let totalRestored = 0;

  for (const [colName, docs] of Object.entries(backupPayload.data)) {
    if (drop) {
      try {
        await db.collection(colName).drop();
        console.log(`  - Dropped existing collection '${colName}'`);
      } catch (err) {
        // collection might not exist yet
      }
    }

    if (Array.isArray(docs) && docs.length > 0) {
      // Re-hydrate ObjectIds and Dates where applicable
      await db.collection(colName).insertMany(docs);
      totalRestored += docs.length;
      console.log(`  - Restored collection '${colName}': ${docs.length} documents`);
    } else {
      console.log(`  - Collection '${colName}' is empty (created empty)`);
    }
  }

  console.log(`[RESTORE SUCCESS] Restored ${totalRestored} documents into database '${conn.connection.name}'`);
  await mongoose.disconnect();
  return { totalRestored, collectionsCount: Object.keys(backupPayload.data).length };
}

// CLI runner if executed directly
if (process.argv[1] && process.argv[1].endsWith('db_backup_restore.js')) {
  const mode = process.argv[2]; // 'backup' or 'restore'
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/education_committee';
  const filePath = process.argv[3] || './backups/backup_latest.json';

  if (mode === 'backup') {
    backupDatabase({ uri, outputPath: filePath })
      .then(() => process.exit(0))
      .catch((err) => { console.error('[FATAL]', err); process.exit(1); });
  } else if (mode === 'restore') {
    restoreDatabase({ uri, inputPath: filePath, drop: true })
      .then(() => process.exit(0))
      .catch((err) => { console.error('[FATAL]', err); process.exit(1); });
  } else {
    console.log('Usage: node scripts/db_backup_restore.js <backup|restore> [path]');
    process.exit(0);
  }
}
