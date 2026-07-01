import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { readPakIndex, extractEntry } from "../lib/pak.js";

const MONGO_URL = "mongodb://127.0.0.1:27017";
const DB_NAME = "StateOfDecay_VN";
const COLLECTION_NAME = "translations";
const SOURCE_PAK = "data-game-park/gamedata.pak";
const BMD_SIG = 0x55424d44;

function readStringsFromBuffer(buf, tableOff) {
  const strs = new Set();
  let start = tableOff;
  for (let i = tableOff; i < buf.length; i += 1) {
    if (buf[i] === 0) {
      if (i > start) {
        strs.add(buf.toString("utf8", start, i));
      }
      start = i + 1;
    }
  }
  return strs;
}

// Hàm gán nhãn khu vực (Zone) cơ bản từ tên file
function determineZone(filePath) {
  if (filePath.includes(".btxt") || filePath.includes("btxt_chunk")) return "Dialog_Subtitle";
  if (filePath.includes("/items/")) return "Items";
  if (filePath.includes("/expertise")) return "Skills_Traits";
  if (filePath.includes("/facilities")) return "Base_Facilities";
  if (filePath.includes("/characters")) return "Characters";
  if (filePath.includes("/missions") || filePath.includes("tasks")) return "Missions";
  if (filePath.includes("/icons/") || filePath.includes("/ui/")) return "UI_Icons";
  return "Other";
}

async function run() {
  console.log("Scanning files to build occurrence map...");
  const stringOccurrences = new Map(); // key: string, value: Set of filenames

  function addOccurrence(text, sourceFile) {
    if (!stringOccurrences.has(text)) {
      stringOccurrences.set(text, new Set());
    }
    stringOccurrences.get(text).add(sourceFile);
  }

  // 1. Quét file BMD
  const pak = readPakIndex(SOURCE_PAK);
  const bmdEntries = pak.entries.filter(e => e.name.endsWith(".bmd"));
  
  for (const entry of bmdEntries) {
    const bmd = extractEntry(pak, entry);
    if (bmd.readUInt32LE(0) !== BMD_SIG) continue;
    
    const tableOff = bmd.readUInt32LE(20);
    const strs = readStringsFromBuffer(bmd, tableOff);
    
    for (const text of strs) {
      addOccurrence(text, entry.name);
    }
  }
  console.log(`Scanned ${bmdEntries.length} BMD files.`);

  // 2. Quét file BTXT (chunks)
  const btxtDirs = ["input/languages/chunks", "output/languages/chunks"];
  let btxtFileCount = 0;
  for (const dir of btxtDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && f.includes("btxt"));
      for (const file of files) {
        const chunk = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
        if (chunk.replacements) {
          for (const r of chunk.replacements) {
            addOccurrence(r.sourceText, file);
          }
        }
        btxtFileCount++;
      }
    }
  }
  
  const pilot = "config/btxt-expanded-pilot.json";
  if (fs.existsSync(pilot)) {
    const chunk = JSON.parse(fs.readFileSync(pilot, "utf8"));
    if (chunk.replacements) {
      for (const r of chunk.replacements) {
        addOccurrence(r.sourceText, "btxt-expanded-pilot.json");
      }
    }
    btxtFileCount++;
  }
  console.log(`Scanned ${btxtFileCount} BTXT chunk files.`);

  console.log("Connecting to MongoDB to update records...");
  const client = new MongoClient(MONGO_URL);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Lấy toàn bộ record hiện tại
    const docs = await collection.find({}).toArray();
    const bulkOps = [];

    for (const doc of docs) {
      const text = doc.sourceText;
      let occurrences = doc.occurrences || [];
      
      // Merge mảng cũ và mảng quét được
      const newOccs = stringOccurrences.get(text) || new Set();
      const mergedSet = new Set([...occurrences, ...Array.from(newOccs)]);
      const finalOccurrences = Array.from(mergedSet);

      // Xác định Zone chính (ưu tiên zone quan trọng hơn nếu xuất hiện nhiều chỗ)
      let primaryZone = "Unknown";
      if (finalOccurrences.length > 0) {
        // Chỉ lấy zone từ file đầu tiên làm đại diện chính
        primaryZone = determineZone(finalOccurrences[0]);
      }

      // Nạp vào Bulk Write
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              occurrences: finalOccurrences,
              zone: primaryZone
            }
          }
        }
      });
    }

    if (bulkOps.length > 0) {
      console.log(`Executing bulk update for ${bulkOps.length} documents...`);
      const result = await collection.bulkWrite(bulkOps);
      console.log(`Update complete! Modified ${result.modifiedCount} documents.`);
    }

  } catch (err) {
    console.error("Update failed:", err);
  } finally {
    await client.close();
  }
}

run();
