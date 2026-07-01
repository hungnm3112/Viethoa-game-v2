import fs from "node:fs";
import path from "node:path";
import { readPakIndex, extractEntry } from "../lib/pak.js";

const SOURCE_PAK = "data-game-park/gamedata.pak";
const CACHE_FILE = "cache/translations.json";
const CHUNKS_DIR = "input/languages/bmd_chunks";
const CHUNK_SIZE = 100;
const BMD_SIG = 0x55424d44;

console.log("Loading cache...");
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};

const pak = readPakIndex(SOURCE_PAK);
const bmdEntries = pak.entries.filter(e => e.name.endsWith(".bmd"));

function readStrings(buf, tableOff) {
  const strs = [];
  let start = tableOff;
  for (let i = tableOff; i < buf.length; i += 1) {
    if (buf[i] === 0) {
      if (i > start) {
        strs.push(buf.toString("utf8", start, i));
      }
      start = i + 1;
    }
  }
  return strs;
}

const allStrings = new Set();

for (const entry of bmdEntries) {
  // Only target items, expertise, facilities, etc.
  if (!entry.name.includes("/items/") && 
      !entry.name.includes("/rts/expertise") && 
      !entry.name.includes("/rts/facilities") &&
      !entry.name.includes("/rts/characters") &&
      !entry.name.includes("/community/tasks")) continue;

  const bmd = extractEntry(pak, entry);
  if (bmd.readUInt32LE(0) !== BMD_SIG) continue;

  const tableOff = bmd.readUInt32LE(20);
  const strs = readStrings(bmd, tableOff);
  for (const s of strs) {
    allStrings.add(s);
  }
}

// Filter out already translated or junk
const untranslated = [];
const junkRegex = /^[a-z0-9_]+$/i; // likely internal IDs if just alphanumeric/underscores without spaces

for (const s of allStrings) {
  if (cache[s] && cache[s].t) continue; // Already translated
  if (s.length < 2) continue; // Too short
  if (junkRegex.test(s)) continue; // Internal ID
  untranslated.push(s);
}

console.log(`Found ${untranslated.length} untranslated legible strings across targeted BMD files.`);

if (untranslated.length > 0) {
  if (!fs.existsSync(CHUNKS_DIR)) fs.mkdirSync(CHUNKS_DIR, { recursive: true });

  let chunkId = 1;
  for (let i = 0; i < untranslated.length; i += CHUNK_SIZE) {
    const chunkStrings = untranslated.slice(i, i + CHUNK_SIZE);
    
    const replacements = chunkStrings.map((s, idx) => ({
      id: `BMD_STR_${i + idx}`,
      sourceText: s,
      translatedText: ""
    }));

    const chunkObj = {
      description: `BMD Manual Translation Chunk ${chunkId}`,
      replacements
    };

    fs.writeFileSync(path.join(CHUNKS_DIR, `bmd_chunk_${chunkId}.json`), JSON.stringify(chunkObj, null, 2));
    chunkId++;
  }
  console.log(`Extracted to ${chunkId - 1} chunks in ${CHUNKS_DIR}`);
}
