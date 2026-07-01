/**
 * Diagnostic: apply all existing translations from the patched BMD but keep
 * each string at the SAME byte length as the original (truncate if longer,
 * space-pad if shorter). The output BMD is byte-identical in size to original.
 *
 * If game does NOT crash → string position shifting is the root cause.
 * If game STILL crashes  → issue is string content (encoding, character set).
 */
import fs from "fs";
import { readPakIndex, extractEntry } from "../lib/pak.js";

const SOURCE_PAK   = 'data-game-park/gamedata.pak';
const TARGET_ENTRY = 'libs/class3/contentmanager/scenes.win.bmd';
const PATCHED_BMD  = 'output/gamedata/libs/class3/contentmanager/scenes.win.bmd';
const OUTPUT_BMD   = 'output/gamedata/libs/class3/contentmanager/scenes.win.bmd';
const BMD_SIG      = 0x55424d44;

const pak     = readPakIndex(SOURCE_PAK);
const entry   = pak.entries.find(e => e.name === TARGET_ENTRY);
const origBmd = extractEntry(pak, entry);
const patchBmd = fs.readFileSync(PATCHED_BMD);

if (origBmd.readUInt32LE(0) !== BMD_SIG) throw new Error('Bad signature (orig)');
if (patchBmd.readUInt32LE(0) !== BMD_SIG) throw new Error('Bad signature (patched)');

const origTableOff  = origBmd.readUInt32LE(20);
const patchTableOff = patchBmd.readUInt32LE(20);

console.log(`Orig:    ${origBmd.length} bytes, tableOff=${origTableOff}`);
console.log(`Patched: ${patchBmd.length} bytes, tableOff=${patchTableOff}`);

// Read strings from both BMDs
function readStrings(buf, tableOff) {
  const strs = [];
  let start = tableOff;
  for (let i = tableOff; i < buf.length; i++) {
    if (buf[i] === 0) { strs.push({ start, end: i, text: buf.toString('utf8', start, i) }); start = i + 1; }
  }
  return strs;
}

const origStrs  = readStrings(origBmd, origTableOff);
const patchStrs = readStrings(patchBmd, patchTableOff);
console.log(`Orig strings: ${origStrs.length}  Patched strings: ${patchStrs.length}`);

// Build output: copy original, then overwrite strings in-place with same-length translated
const out = Buffer.from(origBmd);
let applied = 0, truncated = 0, padded = 0, skipped = 0;

for (let i = 0; i < Math.min(origStrs.length, patchStrs.length); i++) {
  const orig  = origStrs[i];
  const patch = patchStrs[i];
  if (orig.text === patch.text) { skipped++; continue; }

  const origLen  = orig.end - orig.start;   // byte count WITHOUT null
  const transBytes = Buffer.from(patch.text, 'utf8');

  if (transBytes.length === origLen) {
    transBytes.copy(out, orig.start);
    applied++;
  } else if (transBytes.length < origLen) {
    transBytes.copy(out, orig.start);
    out.fill(0x20, orig.start + transBytes.length, orig.end);  // space-pad
    applied++; padded++;
  } else {
    // Truncate to fit, avoiding split multi-byte sequences
    let cutLen = origLen;
    while (cutLen > 0 && (transBytes[cutLen] & 0xc0) === 0x80) cutLen--;
    transBytes.subarray(0, cutLen).copy(out, orig.start);
    if (cutLen < origLen) out.fill(0x20, orig.start + cutLen, orig.end);
    applied++; truncated++;
  }
}

console.log(`Applied: ${applied}  Truncated: ${truncated}  Padded: ${padded}  Unchanged: ${skipped}`);
console.log(`Output: ${out.length} bytes  (original: ${origBmd.length} bytes)  ${out.length === origBmd.length ? 'SAME SIZE ✓' : 'SIZE CHANGED!'}`);

fs.writeFileSync(OUTPUT_BMD, out);
console.log(`Written → ${OUTPUT_BMD}`);
console.log('Now run: node tools/deploy-scenes-bmd-pak.js');
