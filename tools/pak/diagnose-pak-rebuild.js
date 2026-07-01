/**
 * Deep diagnostic: simulate a verbatim rebuild of the original PAK
 * using the EXACT original local header bytes (including extraLen) and
 * original compressed data, with 4096-byte data alignment.
 *
 * If our computed localOff values match original → our alignment logic is
 *   correct; something else (re-compression, field values) is the issue.
 * If they don't match → header size differences (extraLen stripped) are
 *   shifting all subsequent entries, causing the game to read wrong data.
 */
import fs from "fs";

const PAK = 'data-game-park/gamedata.pak';
const OUT = 'output/paks/gamedata-verbatim-rebuild.pak';
const buf = fs.readFileSync(PAK);

// ── Read EOCD ────────────────────────────────────────────────────────────────
let eocdOff = buf.length - 22;
while (buf.readUInt32LE(eocdOff) !== 0x06054b50) eocdOff--;
const totalEntries  = buf.readUInt16LE(eocdOff + 10);
const centralOffset = buf.readUInt32LE(eocdOff + 16);
const centralSize   = buf.readUInt32LE(eocdOff + 12);
console.log(`PAK: ${buf.length} bytes, ${totalEntries} entries, centralOffset=${centralOffset}`);

// ── Read central directory (ALL fields, including raw bytes) ─────────────────
const origCD = [];
let off = centralOffset;
for (let i = 0; i < totalEntries; i++) {
  if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('Bad CDIREC sig at ' + off);
  const nameLen    = buf.readUInt16LE(off + 28);
  const extraLen   = buf.readUInt16LE(off + 30);
  const commentLen = buf.readUInt16LE(off + 32);
  const entrySize  = 46 + nameLen + extraLen + commentLen;
  origCD.push({
    rawCD:   buf.subarray(off, off + entrySize),        // original central dir bytes
    localOff: buf.readUInt32LE(off + 42),
    compSize: buf.readUInt32LE(off + 20),
    method:   buf.readUInt16LE(off + 10),
    name:     buf.subarray(off + 46, off + 46 + nameLen).toString(),
    nameLen, extraLen, commentLen,
  });
  off += entrySize;
}

// ── Check all local headers for extraLen ─────────────────────────────────────
console.log('\n=== Local header extra field audit (all entries) ===');
let nonZeroExtra = 0;
const localHeaders = new Map();
for (const e of origCD) {
  const lOff    = e.localOff;
  if (buf.readUInt32LE(lOff) !== 0x04034b50) throw new Error('Bad local sig at ' + lOff);
  const lNameLen  = buf.readUInt16LE(lOff + 26);
  const lExtraLen = buf.readUInt16LE(lOff + 28);
  localHeaders.set(e.name, { lOff, lNameLen, lExtraLen, headerSize: 30 + lNameLen + lExtraLen });
  if (lExtraLen > 0) {
    nonZeroExtra++;
    if (nonZeroExtra <= 10)
      console.log(`  extraLen=${lExtraLen} → ${e.name}`);
  }
}
if (nonZeroExtra === 0)
  console.log('  (all extraLen = 0 — no issue here)');
else
  console.log(`  Total entries with extraLen > 0: ${nonZeroExtra}`);

// ── Simulate rebuild with 4096 alignment, PRESERVING original header sizes ───
// This mirrors what test-pak-4096-aligned.js does, but uses original headerSize
// (with extraLen) to see if computed offsets match original offsets.
console.log('\n=== Offset simulation: computed vs original (using original header sizes) ===');
const sortedByLocal = [...origCD].sort((a, b) => a.localOff - b.localOff);
let simOffset = 0;
let isFirst   = true;
let mismatch  = 0;
const simLocalOff = new Map();

for (const e of sortedByLocal) {
  const { lOff, lNameLen, lExtraLen, headerSize } = localHeaders.get(e.name);
  let padding = 0;
  if (!isFirst) {
    const dataStart        = simOffset + headerSize;
    const alignedDataStart = Math.ceil(dataStart / 4096) * 4096;
    padding = alignedDataStart - dataStart;
  }
  const newLocalOff = simOffset + padding;
  simLocalOff.set(e.name, newLocalOff);

  if (newLocalOff !== lOff) {
    mismatch++;
    if (mismatch <= 10)
      console.log(`  MISMATCH [entry ${sortedByLocal.indexOf(e)}] ${e.name}: computed=${newLocalOff}, original=${lOff}`);
  }

  simOffset = newLocalOff + headerSize + e.compSize;
  isFirst = false;
}

if (mismatch === 0)
  console.log('  All computed offsets match original — alignment logic is correct.');
else
  console.log(`  Total offset mismatches: ${mismatch}`);

// ── Simulate rebuild with OUR builder's header sizes (extraLen stripped to 0) ─
console.log('\n=== Offset simulation: using STRIPPED header sizes (extraLen forced to 0) ===');
let simOffset2 = 0;
let isFirst2   = true;
let mismatch2  = 0;

for (const e of sortedByLocal) {
  const { lNameLen } = localHeaders.get(e.name);
  const headerSize = 30 + lNameLen;  // our builder strips extraLen
  let padding = 0;
  if (!isFirst2) {
    const dataStart        = simOffset2 + headerSize;
    const alignedDataStart = Math.ceil(dataStart / 4096) * 4096;
    padding = alignedDataStart - dataStart;
  }
  const newLocalOff = simOffset2 + padding;

  if (newLocalOff !== e.localOff) {
    mismatch2++;
    if (mismatch2 <= 10)
      console.log(`  MISMATCH [entry ${sortedByLocal.indexOf(e)}] ${e.name}: stripped-computed=${newLocalOff}, original=${e.localOff}`);
  }

  simOffset2 = newLocalOff + headerSize + e.compSize;
  isFirst2 = false;
}
if (mismatch2 === 0)
  console.log('  Stripped offsets also match — extraLen stripping is not the issue.');
else
  console.log(`  Total offset mismatches with stripped headers: ${mismatch2}`);

// ── Check central directory extra fields ─────────────────────────────────────
console.log('\n=== Central directory extra field audit (all entries) ===');
let cdNonZeroExtra = 0;
for (const e of origCD) {
  if (e.extraLen > 0) {
    cdNonZeroExtra++;
    if (cdNonZeroExtra <= 10)
      console.log(`  CD extraLen=${e.extraLen} → ${e.name}`);
  }
}
if (cdNonZeroExtra === 0)
  console.log('  (all CD extraLen = 0)');
else
  console.log(`  Total CD entries with extraLen > 0: ${cdNonZeroExtra}`);

// ── Verbatim rebuild with original headers + 4096 alignment ──────────────────
// Produces a PAK that should be byte-for-byte identical to original.
console.log('\n=== Building verbatim-rebuild PAK ===');
const localParts   = [];
const centralParts = [];
let buildOffset = 0;
let buildFirst  = true;
const newLocalOffsets = new Map();

for (const e of sortedByLocal) {
  const { lOff, headerSize } = localHeaders.get(e.name);
  // Original local header bytes (includes name + extra)
  const localHeaderBytes = buf.subarray(lOff, lOff + headerSize);
  // Original compressed data
  const dataOff = lOff + headerSize;
  const compData = buf.subarray(dataOff, dataOff + e.compSize);

  let padding = 0;
  if (!buildFirst) {
    const nextDataStart    = buildOffset + headerSize;
    const alignedDataStart = Math.ceil(nextDataStart / 4096) * 4096;
    padding = alignedDataStart - nextDataStart;
  }

  const newLocalOff = buildOffset + padding;
  newLocalOffsets.set(e.name, newLocalOff);

  if (padding > 0) localParts.push(Buffer.alloc(padding));
  localParts.push(localHeaderBytes, compData);

  buildOffset = newLocalOff + headerSize + e.compSize;
  buildFirst  = false;
}

const newCentralOffset = buildOffset;
// Rebuild central dir: original bytes with updated localOff
for (const e of origCD) {
  const rawCD = Buffer.from(e.rawCD);
  rawCD.writeUInt32LE(newLocalOffsets.get(e.name), 42);
  centralParts.push(rawCD);
}
const newCentralDir = Buffer.concat(centralParts);

// EOCD: copy original bytes, update centralOffset
const newEocd = Buffer.from(buf.subarray(eocdOff, eocdOff + 22));
newEocd.writeUInt32LE(newCentralOffset, 16);
newEocd.writeUInt32LE(newCentralDir.length, 12);

const result = Buffer.concat([...localParts, newCentralDir, newEocd]);
console.log(`Verbatim rebuild: ${result.length} bytes (original: ${buf.length} bytes)`);

if (result.length === buf.length) {
  // Byte-compare
  let diffCount = 0;
  let firstDiff = -1;
  for (let i = 0; i < result.length; i++) {
    if (result[i] !== buf[i]) {
      if (diffCount === 0) firstDiff = i;
      diffCount++;
    }
  }
  if (diffCount === 0)
    console.log('PERFECT MATCH — verbatim rebuild is byte-for-byte identical to original.');
  else
    console.log(`Byte differences: ${diffCount}, first at offset ${firstDiff} (0x${firstDiff.toString(16)})`);
} else {
  console.log(`Size mismatch: rebuild=${result.length}, original=${buf.length}, diff=${result.length - buf.length}`);
}

fs.mkdirSync('output/paks', { recursive: true });
fs.writeFileSync(OUT, result);
console.log(`Written → ${OUT}`);
console.log('\nDone. Run node tools/diagnose-pak-rebuild.js to see offset and extra field analysis.');
