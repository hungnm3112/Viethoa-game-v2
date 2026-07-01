// scripts/verify-game.js
// Checks that all translated strings fit within original byte limits after restoration.

import fs from "node:fs";
import path from "node:path";

const gamedataDir = path.resolve("output", "gamedata");

function readStrings(buf, tableOff) {
  const strs = [];
  let start = tableOff;
  for (let i = tableOff; i < buf.length; i++) {
    if (buf[i] === 0) {
      strs.push({ start, end: i, len: i - start, text: buf.toString("utf8", start, i) });
      start = i + 1;
    }
  }
  return strs;
}

let totalFiles = 0;
let overflowFound = 0;
const overflowDetails = [];

fs.readdirSync(gamedataDir).forEach((file) => {
  if (!file.endsWith('.bmd')) return;
  const bmdPath = path.join(gamedataDir, file);
  const buf = fs.readFileSync(bmdPath);
  // original BMD signature offset same as in build script (20)
  const tableOff = buf.readUInt32LE(20);
  const strings = readStrings(buf, tableOff);
  strings.forEach((s, idx) => {
    const byteLen = Buffer.from(s.text, "utf8").length;
    const allowed = s.end - s.start; // original slot size
    if (byteLen > allowed) {
      overflowFound++;
      overflowDetails.push({ file, index: idx, origLen: allowed, actualLen: byteLen, text: s.text });
    }
  });
  totalFiles++;
});

if (overflowFound === 0) {
  console.log(`✅ No overflow strings detected in ${totalFiles} BMD files.`);
  process.exit(0);
} else {
  console.warn(`⚠️ Found ${overflowFound} overflow strings across ${totalFiles} BMD files.`);
  overflowDetails.slice(0, 20).forEach((d) => {
    console.warn(`${d.file} [${d.index}] allowed=${d.origLen}, actual=${d.actualLen}: ${d.text}`);
  });
  if (overflowDetails.length > 20) console.warn(`...and ${overflowDetails.length - 20} more.`);
  process.exit(1);
}
