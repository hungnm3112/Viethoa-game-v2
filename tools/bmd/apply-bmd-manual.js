import fs from "node:fs";
import path from "node:path";
import { readPakIndex, extractEntry } from "../lib/pak.js";

const SOURCE_PAK = "data-game-park/gamedata.pak";
const MASTER_DB = "output/languages/master-translation-db.json";
const OUTPUT_ROOT = "output/gamedata";
const BMD_SIG = 0x55424d44;

console.log("Loading Master Translation DB...");
let masterDb = {};
if (fs.existsSync(MASTER_DB)) {
  masterDb = JSON.parse(fs.readFileSync(MASTER_DB, "utf8"));
}
const translations = new Map(Object.entries(masterDb));
console.log(`Loaded ${translations.size} translations from master DB.`);

if (translations.size === 0) {
  console.log("No translations found. Exiting.");
  process.exit(0);
}

const pak = readPakIndex(SOURCE_PAK);
const bmdEntries = pak.entries.filter(e => e.name.endsWith(".bmd"));

const ABBREV_TABLE = fs.existsSync("scripts/utils/abbrev-table.json") 
  ? JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts/utils/abbrev-table.json"), "utf8"))
  : {};

// Đã phát hiện ra rằng file Flash UI thực tế chưa từng được resize field text. 
// Việc bỏ giới hạn (Whitelist) sẽ gây tràn bộ đệm Scaleform (Crash 0x0106f0e7). 
// Do đó, BẮT BUỘC toàn bộ các file BMD phải bị khóa cứng độ dài.
const WHITELIST_FILES = [
  "libs/class3/contentmanager/scenes.win.bmd",
  "libs/class3/contentmanager/missions.win.bmd",
  "libs/class3/contentmanager/hints.win.bmd",
  "libs/class3/contentmanager/activities.win.bmd",
  "libs/class3/contentmanager/todolist.win.bmd",
  "libs/class3/contentmanager/vehicles.win.bmd",
  "libs/class3/community/interactiondefs.win.bmd"
];

function applyAbbreviations(text) {
  let result = text;
  for (const [long, short] of Object.entries(ABBREV_TABLE)) {
    result = result.replaceAll(long, short);
  }
  return result;
}

function truncateToFitBytes(text, maxBytes) {
  let truncated = text;
  while (Buffer.byteLength(truncated, "utf8") > maxBytes && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return truncated;
}

let filesPatched = 0;
let totalApplied = 0;

const shorterStats = [];
const truncatedStats = [];

for (const entry of bmdEntries) {
  const bmd = extractEntry(pak, entry);
  if (bmd.readUInt32LE(0) !== BMD_SIG) continue;

  const isWhitelisted = WHITELIST_FILES.some(w => entry.name.endsWith(w.replace(/\//g, "\\")) || entry.name.endsWith(w));
  if (!isWhitelisted) {
    console.log(`[NOT WHITELISTED] Skipping ${entry.name}`);
    continue;
  }
  const tableOff = bmd.readUInt32LE(20);
  const outChunks = [bmd.subarray(0, tableOff)];
  let applied = 0;
  let start = tableOff;

  for (let offset = tableOff; offset < bmd.length; offset += 1) {
    if (bmd[offset] !== 0) continue;

    const sourceBytes = bmd.subarray(start, offset);
    const sourceText = sourceBytes.toString("utf8");
    
    if (translations.has(sourceText)) {
      let transText = translations.get(sourceText);
      let transBytes = Buffer.from(transText, "utf8");

      if (!isWhitelisted) {
        // Áp dụng luật khóa độ dài (Exact Length Padding & Truncation)
        if (transBytes.length > sourceBytes.length) {
          const abbrevText = applyAbbreviations(transText);
          const abbrevBytes = Buffer.from(abbrevText, "utf8");

          if (abbrevBytes.length <= sourceBytes.length) {
            transText = abbrevText;
            transBytes = abbrevBytes;
          } else {
            // Cắt ngắn chuỗi an toàn
            transText = truncateToFitBytes(abbrevText, sourceBytes.length);
            transBytes = Buffer.from(transText, "utf8");
            
            truncatedStats.push({
              file: entry.name,
              originalEn: sourceText,
              originalVi: abbrevText,
              truncatedVi: transText,
              maxBytes: sourceBytes.length,
              actualBytes: transBytes.length
            });
          }
        }

        // Bù khoảng trắng cho đủ Byte
        if (transBytes.length < sourceBytes.length) {
          const padCount = sourceBytes.length - transBytes.length;
          const padding = Buffer.alloc(padCount, 32); // Space character
          transBytes = Buffer.concat([transBytes, padding]);
          
          shorterStats.push({
            file: entry.name,
            originalEn: sourceText,
            translation: transText,
            paddedBytes: padCount
          });
        }
      }

      outChunks.push(transBytes, Buffer.from([0]));
      applied += 1;
    } else {
      outChunks.push(sourceBytes, Buffer.from([0]));
    }
    
    start = offset + 1;
  }
  
  if (start < bmd.length) {
    outChunks.push(bmd.subarray(start));
  }

  if (applied > 0) {
    const patchedBuffer = Buffer.concat(outChunks);
    patchedBuffer.writeUInt32LE(patchedBuffer.length - tableOff, 24);
    
    const outputPath = path.join(OUTPUT_ROOT, entry.name);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, patchedBuffer);
    
    console.log(`Patched ${entry.name}: applied ${applied} strings. (Whitelisted: ${isWhitelisted})`);
    filesPatched++;
    totalApplied += applied;
  }
}

console.log(`Done. Patched ${filesPatched} files with ${totalApplied} total translation insertions.`);

// Write stats reports
const reportsDir = "output/reports";
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

fs.writeFileSync(path.join(reportsDir, "bmd-shorter-strings.json"), JSON.stringify(shorterStats, null, 2));
fs.writeFileSync(path.join(reportsDir, "bmd-truncated-strings.json"), JSON.stringify(truncatedStats, null, 2));

console.log(`Saved stats: ${shorterStats.length} shorter strings, ${truncatedStats.length} truncated strings.`);
