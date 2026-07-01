import fs from "node:fs";
import { MongoClient } from "mongodb";

const MONGO_URL = "mongodb://127.0.0.1:27017";
const DB_NAME = "StateOfDecay_VN";
const COLLECTION_NAME = "translations";

const MASTER_DB_PATH = "output/languages/master-translation-db.json";
const SHORTER_STATS_PATH = "output/reports/bmd-shorter-strings.json";
const TRUNCATED_STATS_PATH = "output/reports/bmd-truncated-strings.json";

async function run() {
  console.log("Connecting to MongoDB...");
  const client = new MongoClient(MONGO_URL);

  try {
    await client.connect();
    console.log("Connected successfully to server");
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Create unique index on sourceText
    await collection.createIndex({ sourceText: 1 }, { unique: true });

    // Load data
    const masterDb = JSON.parse(fs.readFileSync(MASTER_DB_PATH, "utf8"));
    const shorterStats = fs.existsSync(SHORTER_STATS_PATH) ? JSON.parse(fs.readFileSync(SHORTER_STATS_PATH, "utf8")) : [];
    const truncatedStats = fs.existsSync(TRUNCATED_STATS_PATH) ? JSON.parse(fs.readFileSync(TRUNCATED_STATS_PATH, "utf8")) : [];

    // Process stats into maps for easy lookup
    const metadataMap = new Map();

    for (const stat of shorterStats) {
      if (!metadataMap.has(stat.originalEn)) metadataMap.set(stat.originalEn, { occurrences: new Set(), isTooLong: false, isTruncated: false });
      metadataMap.get(stat.originalEn).occurrences.add(stat.file);
    }

    for (const stat of truncatedStats) {
      if (!metadataMap.has(stat.originalEn)) metadataMap.set(stat.originalEn, { occurrences: new Set(), isTooLong: true, isTruncated: true });
      metadataMap.get(stat.originalEn).occurrences.add(stat.file);
      metadataMap.get(stat.originalEn).isTooLong = true;
      metadataMap.get(stat.originalEn).isTruncated = true;
    }

    console.log("Preparing bulk operations...");
    const bulkOps = [];

    for (const [sourceText, translatedText] of Object.entries(masterDb)) {
      const lengthEn = Buffer.byteLength(sourceText, "utf8");
      const lengthVi = Buffer.byteLength(translatedText, "utf8");
      const meta = metadataMap.get(sourceText) || { occurrences: new Set(), isTooLong: false, isTruncated: false };

      // Determine if it's naturally too long (even if not marked by truncatedStats due to whitelist)
      const naturallyTooLong = lengthVi > lengthEn;

      bulkOps.push({
        updateOne: {
          filter: { sourceText: sourceText },
          update: {
            $set: {
              sourceText: sourceText,
              translatedText: translatedText,
              status: "final",
              lengthEn: lengthEn,
              lengthVi: lengthVi,
              isTooLong: naturallyTooLong,
              isTruncated: meta.isTruncated,
              occurrences: Array.from(meta.occurrences),
              lastUpdated: new Date()
            }
          },
          upsert: true
        }
      });
    }

    console.log(`Executing bulk write for ${bulkOps.length} documents...`);
    const result = await collection.bulkWrite(bulkOps);
    console.log(`Migration Complete!`);
    console.log(`- Inserted: ${result.upsertedCount}`);
    console.log(`- Updated: ${result.modifiedCount}`);

  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.close();
  }
}

run();
