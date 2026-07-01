/**
 * Extract all untranslated BMD strings (those where original == patched).
 * These are strings that build-bmd.js couldn't match to any XML translation.
 * Output: JSON file with all untranslated strings per BMD file.
 */
import fs from "fs";
import path from "path";
import { readPakIndex, extractEntry } from "../lib/pak.js";

const SOURCE_PAK = 'data-game-park/gamedata.pak';
const OUTPUT_DIR = 'output/gamedata';
const OUT_FILE   = 'output/reports/untranslated-strings.json';
const BMD_SIG    = 0x55424d44;

const pak = readPakIndex(SOURCE_PAK);
const bmdEntries = pak.entries.filter(e => e.name.endsWith('.bmd'));

function readStrings(buf, tableOff) {
  const strs = [];
  let start = tableOff;
  for (let i = tableOff; i < buf.length; i++) {
    if (buf[i] === 0) {
      strs.push(buf.toString('utf8', start, i));
      start = i + 1;
    }
  }
  return strs;
}

function isIdentifier(text) {
  if (/^<[A-Za-z][A-Za-z0-9_]*>$/.test(text)) return true;
  if (/^\d+\s+[A-Z]{2,}/.test(text)) return true;
  if (!/\s/.test(text) && /^[\w./\\<>:-]+$/.test(text)) return true;
  if (text.length === 0) return true;
  return false;
}

const result = {};
let totalUntranslated = 0;
let totalTranslatable = 0;

for (const entry of bmdEntries) {
  const patchedPath = path.join(OUTPUT_DIR, entry.name);
  if (!fs.existsSync(patchedPath)) continue;

  const origBmd  = extractEntry(pak, entry);
  const patchBmd = fs.readFileSync(patchedPath);

  if (origBmd.readUInt32LE(0) !== BMD_SIG) continue;

  const origTableOff  = origBmd.readUInt32LE(20);
  const patchTableOff = patchBmd.readUInt32LE(20);

  const origStrs  = readStrings(origBmd,  origTableOff);
  const patchStrs = readStrings(patchBmd, patchTableOff);

  const untranslated = [];
  for (let i = 0; i < Math.min(origStrs.length, patchStrs.length); i++) {
    if (origStrs[i] !== patchStrs[i]) continue;   // already translated
    if (isIdentifier(origStrs[i])) continue;       // skip identifiers
    untranslated.push(origStrs[i]);
  }

  if (untranslated.length > 0) {
    result[entry.name] = untranslated;
    totalUntranslated += untranslated.length;
    totalTranslatable += untranslated.filter(s => s.trim().length > 0 && /[a-zA-Z]/.test(s)).length;
    console.log(`${entry.name}: ${untranslated.length} untranslated (sample: "${untranslated[0]?.slice(0,60)}")`);
  }
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');
console.log(`\nTotal untranslated: ${totalUntranslated}`);
console.log(`Total with Latin text (translatable): ${totalTranslatable}`);
console.log(`Written → ${OUT_FILE}`);
