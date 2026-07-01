import { MongoClient } from "mongodb";

let clientPromise = null;
let mongoDisabled = false;

const mongoUri = String(process.env.MONGODB_URI ?? "").trim();
const explicitDbName = String(process.env.MONGODB_DB ?? "").trim();

export function isMongoConfigured() {
  return !mongoDisabled && mongoUri.length > 0;
}

export async function getMongoDb() {
  if (!isMongoConfigured()) return null;
  if (!clientPromise) {
    clientPromise = MongoClient.connect(mongoUri, { maxPoolSize: 10 });
  }
  try {
    const client = await clientPromise;
    return client.db(resolveDbName());
  } catch (error) {
    mongoDisabled = true;
    console.warn(`MongoDB unavailable, fallback to file store: ${error.message}`);
    return null;
  }
}

export async function closeMongoClient() {
  if (!clientPromise) return;
  try {
    const client = await clientPromise;
    await client.close();
  } catch {
    // Ignore close errors during one-shot script shutdown.
  } finally {
    clientPromise = null;
  }
}

export async function readStateDocument(key, fallback) {
  const db = await getMongoDb();
  if (!db) return fallback;
  const doc = await db.collection("state_blobs").findOne({ _id: key });
  return doc?.value ?? fallback;
}

export async function writeStateDocument(key, value) {
  const db = await getMongoDb();
  if (!db) return false;
  await db.collection("state_blobs").updateOne(
    { _id: key },
    {
      $set: {
        value,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
  return true;
}

export async function readTranslationCache() {
  const db = await getMongoDb();
  if (!db) return {};
  const output = {};
  const cursor = db.collection("translations_cache").find({}, { projection: { _id: 1, translated: 1 } });
  for await (const doc of cursor) {
    output[doc._id] = doc.translated;
  }
  return output;
}

export async function upsertTranslationEntries(entries) {
  const db = await getMongoDb();
  if (!db) return false;
  const docs = Object.entries(entries ?? {});
  if (docs.length === 0) return true;
  await db.collection("translations_cache").bulkWrite(
    docs.map(([source, translated]) => ({
      updateOne: {
        filter: { _id: source },
        update: {
          $set: {
            source,
            translated,
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return true;
}

export async function appendLog(collectionName, document) {
  const db = await getMongoDb();
  if (!db) return false;
  await db.collection(collectionName).insertOne({
    ...document,
    storedAt: new Date(),
  });
  return true;
}

export async function readRecentLogs(collectionName, limit = 50) {
  const db = await getMongoDb();
  if (!db) return [];
  return db.collection(collectionName).find({}, { sort: { storedAt: -1 }, limit }).toArray();
}

function resolveDbName() {
  if (explicitDbName) return explicitDbName;
  try {
    const parsed = new URL(mongoUri);
    const pathname = parsed.pathname.replace(/^\//, "").trim();
    return pathname || "ViethoaGame";
  } catch {
    return "ViethoaGame";
  }
}
