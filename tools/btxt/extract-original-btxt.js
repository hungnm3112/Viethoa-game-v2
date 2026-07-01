import fs from "node:fs";
import path from "node:path";
import { extractEntry, readPakIndex } from "../lib/pak.js";

const PAK_PATH = "data-game-park/gamedata.pak";
const OUTPUT_ROOT = "output/original/gamedata/languages";
const ENTRIES = [
  "languages/english.win.btxt",
  "languages/englishau.win.btxt",
];

const index = readPakIndex(PAK_PATH);

fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

for (const entryName of ENTRIES) {
  const entry = index.entries.find((item) => item.name === entryName);
  if (!entry) {
    throw new Error(`Missing ${entryName} in ${PAK_PATH}`);
  }

  const outputFile = path.join(OUTPUT_ROOT, path.basename(entryName));
  fs.writeFileSync(outputFile, extractEntry(index, entry));
  console.log(`Wrote ${outputFile}`);
}
