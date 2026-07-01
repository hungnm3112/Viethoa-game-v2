/**
 * Analyze gaps between entries in the original PAK.
 * Identifies alignment padding or extra bytes between compressed data and next local header.
 */
import fs from "fs";

const PAK = 'data-game-park/gamedata.pak';
const buf = fs.readFileSync(PAK);

// Find EOCD
let eocdOff = buf.length - 22;
while (buf.readUInt32LE(eocdOff) !== 0x06054b50) eocdOff--;
const centralOffset = buf.readUInt32LE(eocdOff + 16);
const totalEntries  = buf.readUInt16LE(eocdOff + 10);

// Read all entries from central dir
const entries = [];
let off = centralOffset;
for (let i = 0; i < totalEntries; i++) {
  const nameLen    = buf.readUInt16LE(off + 28);
  const extraLen   = buf.readUInt16LE(off + 30);
  const commentLen = buf.readUInt16LE(off + 32);
  entries.push({
    name:     buf.subarray(off + 46, off + 46 + nameLen).toString('utf8'),
    localOff: buf.readUInt32LE(off + 42),
    compSize: buf.readUInt32LE(off + 20),
    method:   buf.readUInt16LE(off + 10),
  });
  off += 46 + nameLen + extraLen + commentLen;
}

// Sort by local offset to see actual file layout
const sorted = [...entries].sort((a, b) => a.localOff - b.localOff);

// Show first 10 entries with gap info
console.log('=== First 10 entries (sorted by localOff) ===');
for (let i = 0; i < Math.min(10, sorted.length); i++) {
  const e = sorted[i];
  const localOff  = e.localOff;
  const nameLen   = buf.readUInt16LE(localOff + 26);
  const extraLen2 = buf.readUInt16LE(localOff + 28);
  const dataStart = localOff + 30 + nameLen + extraLen2;
  const dataEnd   = dataStart + e.compSize;
  const nextOff   = i + 1 < sorted.length ? sorted[i + 1].localOff : centralOffset;
  const gap       = nextOff - dataEnd;
  const gapSample = gap > 0 ? buf.subarray(dataEnd, Math.min(dataEnd + 32, nextOff)).toString('hex') : '';

  console.log(`[${i}] ${e.name} (method=${e.method})`);
  console.log(`    localOff=${localOff}  dataStart=${dataStart}  dataEnd=${dataEnd}  compSize=${e.compSize}`);
  console.log(`    gap=${gap}  nextOff=${nextOff}`);
  if (gap > 0) console.log(`    gapBytes[0..31]: ${gapSample}`);
}

// Compute total gap across all entries
let totalGap = 0;
let gapCount = 0;
const gapSizes = [];
for (let i = 0; i < sorted.length; i++) {
  const e        = sorted[i];
  const localOff = e.localOff;
  const nameLen  = buf.readUInt16LE(localOff + 26);
  const extraLen2= buf.readUInt16LE(localOff + 28);
  const dataEnd  = localOff + 30 + nameLen + extraLen2 + e.compSize;
  const nextOff  = i + 1 < sorted.length ? sorted[i + 1].localOff : centralOffset;
  const gap      = nextOff - dataEnd;
  if (gap > 0) { totalGap += gap; gapCount++; gapSizes.push(gap); }
}

gapSizes.sort((a, b) => a - b);
console.log(`\n=== Gap summary ===`);
console.log(`Entries with gaps:  ${gapCount} / ${sorted.length}`);
console.log(`Total gap bytes:    ${totalGap}`);
if (gapSizes.length > 0) {
  console.log(`Min gap:            ${gapSizes[0]}`);
  console.log(`Max gap:            ${gapSizes[gapSizes.length - 1]}`);
  console.log(`Median gap:         ${gapSizes[Math.floor(gapSizes.length / 2)]}`);
}

// Check if gaps are multiples of common alignment values
const alignments = [512, 1024, 2048, 4096];
for (const align of alignments) {
  const allAligned = sorted.every((e, i) => {
    const localOff  = e.localOff;
    const nameLen   = buf.readUInt16LE(localOff + 26);
    const extraLen2 = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + nameLen + extraLen2;
    return dataStart % align === 0 || localOff % align === 0;
  });

  const dataAligned = sorted.filter((e) => {
    const localOff  = e.localOff;
    const nameLen   = buf.readUInt16LE(localOff + 26);
    const extraLen2 = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + nameLen + extraLen2;
    return dataStart % align === 0;
  }).length;

  const headerAligned = sorted.filter((e) => e.localOff % align === 0).length;

  console.log(`Alignment ${align}: ${headerAligned}/${sorted.length} headers aligned, ${dataAligned}/${sorted.length} data sections aligned`);
}

// Check the gap bytes: are they all zeros?
let nonZeroGaps = 0;
for (let i = 0; i < sorted.length - 1; i++) {
  const e        = sorted[i];
  const localOff = e.localOff;
  const nameLen  = buf.readUInt16LE(localOff + 26);
  const extraLen2= buf.readUInt16LE(localOff + 28);
  const dataEnd  = localOff + 30 + nameLen + extraLen2 + e.compSize;
  const nextOff  = sorted[i + 1].localOff;
  const gap      = nextOff - dataEnd;
  if (gap > 0) {
    const gapBuf = buf.subarray(dataEnd, nextOff);
    const hasNonZero = gapBuf.some(b => b !== 0);
    if (hasNonZero) nonZeroGaps++;
  }
}
console.log(`\nGaps with non-zero bytes: ${nonZeroGaps} / ${gapCount}`);