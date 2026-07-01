import { MongoClient } from "mongodb";

const MONGO_URL = "mongodb://127.0.0.1:27017";
const DB_NAME = "StateOfDecay_VN";
const COLLECTION_NAME = "translations";

async function run() {
  const client = new MongoClient(MONGO_URL);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const total = await collection.countDocuments();
    const truncated = await collection.countDocuments({ isTruncated: true });
    const tooLong = await collection.countDocuments({ isTooLong: true });
    const shorter = await collection.countDocuments({ isTooLong: false, isTruncated: false, $expr: { $lt: ["$lengthVi", "$lengthEn"] }});
    
    // Aggregate by zone
    const zoneAggregation = await collection.aggregate([
      { $group: { _id: "$zone", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    console.log("=== TRANSLATION DATABASE STATS ===");
    console.log(`Total translated strings: ${total}`);
    console.log(`- Strings longer than original (isTooLong): ${tooLong}`);
    console.log(`- Strings truncated due to limits (isTruncated): ${truncated}`);
    console.log(`- Strings shorter than original (needs padding): ${shorter}`);
    console.log(`- Strings perfectly matched length: ${total - tooLong - shorter}`);
    
    console.log("\n=== ZONES (Phân Khu) ===");
    for (const z of zoneAggregation) {
      console.log(`- [${z._id || "Unknown"}]: ${z.count} strings`);
    }
    console.log("==================================");

  } catch (err) {
    console.error("Stats check failed:", err);
  } finally {
    await client.close();
  }
}

run();
