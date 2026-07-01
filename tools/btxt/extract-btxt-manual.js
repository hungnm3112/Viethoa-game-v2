import fs from "node:fs";
import path from "node:path";
import { readPakIndex, extractEntry } from "../lib/pak.js";

const PAK_PATH = "data-game-park/gamedata.pak";
const TARGET_ENTRY = "languages/english.win.btxt";
const OUT_DIR = "input/languages/chunks";
const CHUNK_SIZE = 100;

console.log(`Reading ${PAK_PATH}...`);
const pakIndex = readPakIndex(PAK_PATH);
const entry = pakIndex.entries.find((item) => item.name === TARGET_ENTRY);

if (!entry) {
  console.error(`Could not find ${TARGET_ENTRY} in ${PAK_PATH}`);
  process.exit(1);
}

const buffer = extractEntry(pakIndex, entry);
const uniqueStrings = new Set();
let start = 20;

for (let i = 20; i < buffer.length; i++) {
  if (buffer[i] === 0) {
    const str = buffer.toString('utf8', start, i).trim();
    if (str && str.length > 1 && !/^[0-9A-Z_]+$/.test(str)) { // Filter out raw identifiers/empty
      uniqueStrings.add(str);
    }
    start = i + 1;
  }
}

const allStrings = Array.from(uniqueStrings);
console.log(`Found ${allStrings.length} unique readable strings out of ~21000 total.`);

fs.mkdirSync(OUT_DIR, { recursive: true });

let chunkIndex = 1;
for (let i = 0; i < allStrings.length; i += CHUNK_SIZE) {
  const chunk = allStrings.slice(i, i + CHUNK_SIZE);
  const replacements = chunk.map((str, idx) => ({
    id: `UI_STR_${i + idx}`,
    sourceText: str,
    translatedText: ""
  }));
  
  const manifest = {
    description: `Manual Translation Chunk ${chunkIndex}`,
    replaceAll: true,
    replacements
  };
  
  const filePath = path.join(OUT_DIR, `btxt_chunk_${chunkIndex}.json`);
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), "utf8");
  chunkIndex++;
}

console.log(`Extracted to ${chunkIndex - 1} chunk files in ${OUT_DIR}`);
