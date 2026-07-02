import fs from "node:fs";
import { MongoClient } from "mongodb";

const MONGO_URL = "mongodb://127.0.0.1:27017";
const DB_NAME = "StateOfDecay_VN";
const COLLECTION_NAME = "translations";

const OUTPUT_PATH = "master-translation-db.json";

async function run() {
  console.log("Connecting to MongoDB to export translations...");
  const client = new MongoClient(MONGO_URL);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Fetch all final translations
    const cursor = collection.find({ status: "final" });
    const docs = await cursor.toArray();

    const exportData = {};
    for (const doc of docs) {
      exportData[doc.sourceText] = doc.translatedText;
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(exportData, null, 2), "utf8");
    console.log(`Exported ${docs.length} translations to ${OUTPUT_PATH}`);

  } catch (err) {
    console.error("Export failed:", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
