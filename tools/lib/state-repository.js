import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./json-store.js";
import {
  appendLog,
  isMongoConfigured,
  readRecentLogs,
  readStateDocument,
  readTranslationCache,
  upsertTranslationEntries,
  writeStateDocument,
} from "./mongo-store.js";

export async function readStateJson(key, filePath, fallback) {
  if (isMongoConfigured()) {
    const value = await readStateDocument(key, undefined);
    if (value !== undefined) return value;
  }
  return readJson(filePath, fallback);
}

export async function writeStateJson(key, filePath, value) {
  writeJson(filePath, value);
  if (isMongoConfigured()) {
    await writeStateDocument(key, value);
  }
  return value;
}

export async function loadTranslationCache(filePath) {
  if (isMongoConfigured()) {
    const cache = await readTranslationCache();
    if (Object.keys(cache).length > 0) return cache;
  }
  return readJson(filePath, {});
}

export async function persistTranslationEntries(filePath, fullCacheObject, updatedEntries) {
  writeJson(filePath, fullCacheObject);
  if (isMongoConfigured()) {
    await upsertTranslationEntries(updatedEntries);
  }
}

export async function appendCollectionLog(filePath, collectionName, document) {
  if (filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(document)}\n`, "utf8");
  }
  if (isMongoConfigured()) {
    await appendLog(collectionName, document);
  }
}

export async function readRecentCollectionLogs(filePath, collectionName, limit = 50) {
  if (isMongoConfigured()) {
    const docs = await readRecentLogs(collectionName, limit);
    if (docs.length > 0) {
      return docs.map(({ _id, storedAt, ...rest }) => ({
        ...rest,
        storedAt: storedAt?.toISOString?.() ?? storedAt,
      }));
    }
  }

  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line))
    .reverse();
}
