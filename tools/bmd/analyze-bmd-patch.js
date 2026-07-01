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

let idChanges = 0;
let diagChanges = 0;
const idSamples = [];
const diagSamples = [];

for (let i = 0; i < Math.min(origStrs.length, patchStrs.length); i++) {
  if (origStrs[i] !== patchStrs[i]) {
    const orig = origStrs[i];
    const patched = patchStrs[i];
    const hasBackslash = orig.indexOf('\\') >= 0;
    const noSpaces = orig.indexOf(' ') < 0;
    const idPattern = /^[A-Z0-9_]+$/.test(orig);
    const startsWithNum = /^\d+\s+[A-Z]/.test(orig);
    const isId = hasBackslash || noSpaces || idPattern || startsWithNum;
    if (isId) {
      idChanges++;
      if (idSamples.length < 10) idSamples.push({ orig, patched });
    } else {
      diagChanges++;
      if (diagSamples.length < 3) diagSamples.push({ orig, patched });
    }
  }
}

console.log('=== BMD Patch Analysis ===');
console.log('Original strings:', origStrs.length);
console.log('Patched strings:', patchStrs.length);
console.log('');
console.log('ID-like strings changed (PROBLEM):', idChanges);
idSamples.forEach(s => console.log('  ID:', JSON.stringify(s.orig), '->', JSON.stringify(s.patched)));
console.log('');
console.log('Dialogue strings changed (OK):', diagChanges);
diagSamples.forEach(s => console.log('  DLG:', JSON.stringify(s.orig), '->', JSON.stringify(s.patched)));
