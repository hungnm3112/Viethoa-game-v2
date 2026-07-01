/**
 * Dump ALL changed strings between original and patched scenes.win.bmd
 * to identify any remaining dangerous identifier strings.
 */
import fs from "fs";
import { extractEntry, readPakIndex } from "../lib/pak.js";

const pak = readPakIndex('data-game-park/gamedata.pak');
const entry = pak.entries.find(e => e.name === 'libs/class3/contentmanager/scenes.win.bmd');
const origBuf = extractEntry(pak, entry);
const patchedBuf = fs.readFileSync('output/gamedata/libs/class3/contentmanager/scenes.win.bmd');

function getStrings(buf, startOff) {
  const strings = [];
  let pos = startOff;
  while (pos < buf.length) {
    let end = pos;
    while (end < buf.length && buf[end] !== 0) end++;
    strings.push(buf.toString('utf8', pos, end));
    pos = end + 1;
  }
  return strings;
}

const origStrs = getStrings(origBuf, origBuf.readUInt32LE(20));
const patchStrs = getStrings(patchedBuf, patchedBuf.readUInt32LE(20));

console.log(`Original: ${origStrs.length} strings, Patched: ${patchStrs.length} strings`);
console.log(`Original file: ${origBuf.length} bytes, Patched file: ${patchedBuf.length} bytes`);
console.log(`Size diff: +${patchedBuf.length - origBuf.length} bytes`);
console.log('');

const changed = [];
for (let i = 0; i < Math.min(origStrs.length, patchStrs.length); i++) {
  if (origStrs[i] !== patchStrs[i]) {
    changed.push({ i, orig: origStrs[i], patched: patchStrs[i] });
  }
}

console.log(`Total changed: ${changed.length}`);
console.log('');

// Categorize
const suspicious = [];
const likely_ok = [];

for (const { i, orig, patched } of changed) {
  // Heuristics for "suspicious" - might be an identifier, not pure dialogue
  const hasAngleBracket = orig.includes('<') || orig.includes('>');
  const startsWithDigit = /^\d/.test(orig);
  const allUpperCase = /^[A-Z]/.test(orig) && orig === orig.toUpperCase().replace(/[^A-Za-z]/g, orig);
  const noLettersOrShort = orig.length <= 3;
  const looksLikeCode = /[_{}[\]|\\]/.test(orig);
  const multipleUpperWords = /^([A-Z][a-z]+\s+){2,}[A-Z]/.test(orig); // PascalCase words

  if (hasAngleBracket || startsWithDigit || looksLikeCode || multipleUpperWords) {
    suspicious.push({ i, orig, patched });
  } else {
    likely_ok.push({ i, orig, patched });
  }
}

console.log(`=== SUSPICIOUS (${suspicious.length}) — might be identifiers ===`);
for (const { i, orig, patched } of suspicious) {
  console.log(`  [${i}] ${JSON.stringify(orig)}`);
  console.log(`       → ${JSON.stringify(patched)}`);
}

console.log('');
console.log(`=== LIKELY OK dialogue (${likely_ok.length}) ===`);
for (const { i, orig, patched } of likely_ok.slice(0, 50)) {
  console.log(`  [${i}] ${JSON.stringify(orig.substring(0, 80))} → ${JSON.stringify(patched.substring(0, 80))}`);
}
if (likely_ok.length > 50) {
  console.log(`  ... and ${likely_ok.length - 50} more`);
}
