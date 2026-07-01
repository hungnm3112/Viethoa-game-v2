/**
 * Diagnostic: compare original PAK vs rebuilt PAK field-by-field
 * to find what structural difference causes the game to crash.
 */
import fs from "fs";

const ORIGINAL = 'data-game-park/gamedata.pak';
const REBUILT  = 'output/paks/gamedata-original-bmd-test.pak';

const origBuf    = fs.readFileSync(ORIGINAL);
const rebuiltBuf = fs.readFileSync(REBUILT);

// ---- EOCD ----------------------------------------------------------------
function findEOCD(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 0xffff - 22); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('No EOCD found');
}

function readEOCD(buf) {
  const off = findEOCD(buf);
  return {
    offset: off,
    diskNum:       buf.readUInt16LE(off + 4),
    diskWithStart: buf.readUInt16LE(off + 6),
    entryCount:    buf.readUInt16LE(off + 8),
    totalEntries:  buf.readUInt16LE(off + 10),
    centralSize:   buf.readUInt32LE(off + 12),
    centralOffset: buf.readUInt32LE(off + 16),
    commentLen:    buf.readUInt16LE(off + 20),
  };
}

// ---- Central Dir ---------------------------------------------------------
function readCentralDir(buf) {
  const eocd = readEOCD(buf);
  const entries = [];
  let off = eocd.centralOffset;
  for (let i = 0; i < eocd.totalEntries; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('Bad central sig at ' + off);
    const nameLen    = buf.readUInt16LE(off + 28);
    const extraLen   = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    entries.push({
      verMade:    buf.readUInt16LE(off + 4),
      verNeeded:  buf.readUInt16LE(off + 6),
      flags:      buf.readUInt16LE(off + 8),
      method:     buf.readUInt16LE(off + 10),
      modTime:    buf.readUInt16LE(off + 12),
      modDate:    buf.readUInt16LE(off + 14),
      crc:        buf.readUInt32LE(off + 16),
      compSize:   buf.readUInt32LE(off + 20),
      uncompSize: buf.readUInt32LE(off + 24),
      nameLen, extraLen, commentLen,
      diskStart:  buf.readUInt16LE(off + 34),
      intAttrs:   buf.readUInt16LE(off + 36),
      extAttrs:   buf.readUInt32LE(off + 38),
      localOff:   buf.readUInt32LE(off + 42),
      name:       buf.subarray(off + 46, off + 46 + nameLen).toString('utf8').replace(/\\/g, '/'),
      extraBytes: buf.subarray(off + 46 + nameLen, off + 46 + nameLen + extraLen),
    });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return { eocd, entries };
}

// ---- Local Header --------------------------------------------------------
function readLocalHeader(buf, off) {
  if (buf.readUInt32LE(off) !== 0x04034b50) throw new Error('Bad local sig at ' + off);
  const nameLen  = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  return {
    verNeeded:  buf.readUInt16LE(off + 4),
    flags:      buf.readUInt16LE(off + 6),
    method:     buf.readUInt16LE(off + 8),
    modTime:    buf.readUInt16LE(off + 10),
    modDate:    buf.readUInt16LE(off + 12),
    crc:        buf.readUInt32LE(off + 14),
    compSize:   buf.readUInt32LE(off + 18),
    uncompSize: buf.readUInt32LE(off + 22),
    nameLen, extraLen,
    name:       buf.subarray(off + 30, off + 30 + nameLen).toString('utf8').replace(/\\/g, '/'),
    extraBytes: buf.subarray(off + 30 + nameLen, off + 30 + nameLen + extraLen),
    dataOffset: off + 30 + nameLen + extraLen,
  };
}

// =========================================================================
const { eocd: origEOCD, entries: origCD }    = readCentralDir(origBuf);
const { eocd: rebuiltEOCD, entries: rebuiltCD } = readCentralDir(rebuiltBuf);

// ---- EOCD compare -------------------------------------------------------
console.log('=== EOCD COMPARISON ===');
const eocdFields = ['diskNum','diskWithStart','entryCount','totalEntries','centralSize','centralOffset','commentLen'];
for (const f of eocdFields) {
  const o = origEOCD[f], r = rebuiltEOCD[f];
  const mark = o === r ? '  OK' : '  *** DIFF';
  console.log(`  ${f.padEnd(14)}: orig=${o}  rebuilt=${r}${mark}`);
}

// ---- Central Dir compare (first 5 + last 1) -----------------------------
console.log('\n=== CENTRAL DIRECTORY: per-entry comparison (first 5) ===');
const diff = (label, o, r) => {
  const mark = o === r ? '' : `  *** DIFF: orig=${o}, rebuilt=${r}`;
  if (mark) console.log(`      ${label}: ${o}${mark}`);
};

let cdDiffCount = 0;
for (let i = 0; i < Math.min(5, origCD.length); i++) {
  const o = origCD[i], r = rebuiltCD[i];
  console.log(`\n  [${i}] ${o.name}`);
  for (const f of ['verMade','verNeeded','flags','method','crc','compSize','uncompSize',
                    'nameLen','extraLen','commentLen','diskStart','intAttrs','extAttrs','localOff']) {
    if (o[f] !== r[f]) {
      console.log(`      ${f.padEnd(12)}: orig=${o[f]}  rebuilt=${r[f]}  *** DIFF`);
      cdDiffCount++;
    }
  }
  if (o.extraLen > 0) console.log(`      orig extra bytes: ${o.extraBytes.toString('hex')}`);
  if (r.extraLen > 0) console.log(`      rebuilt extra bytes: ${r.extraBytes.toString('hex')}`);
}
if (cdDiffCount === 0) console.log('  (no differences in first 5 central dir entries)');

// ---- Local Header compare (first 5) -------------------------------------
console.log('\n=== LOCAL HEADERS: per-entry comparison (first 5) ===');
let lhDiffCount = 0;
for (let i = 0; i < Math.min(5, origCD.length); i++) {
  const oe = origCD[i], re = rebuiltCD[i];
  const oh = readLocalHeader(origBuf,    oe.localOff);
  const rh = readLocalHeader(rebuiltBuf, re.localOff);
  console.log(`\n  [${i}] ${oe.name}`);
  for (const f of ['verNeeded','flags','method','crc','compSize','uncompSize','nameLen','extraLen']) {
    if (oh[f] !== rh[f]) {
      console.log(`      ${f.padEnd(12)}: orig=${oh[f]}  rebuilt=${rh[f]}  *** DIFF`);
      lhDiffCount++;
    }
  }
  // Local vs Central mismatch in ORIGINAL (important!)
  if (oe.compSize !== oh.compSize)
    console.log(`      *** LOCAL/CENTRAL compSize mismatch in ORIGINAL: local=${oh.compSize}, central=${oe.compSize}`);
  if (oe.uncompSize !== oh.uncompSize)
    console.log(`      *** LOCAL/CENTRAL uncompSize mismatch in ORIGINAL: local=${oh.uncompSize}, central=${oe.uncompSize}`);
  if (oh.extraLen > 0) console.log(`      orig local extra bytes: ${oh.extraBytes.toString('hex')}`);
  if (rh.extraLen > 0) console.log(`      rebuilt local extra bytes: ${rh.extraBytes.toString('hex')}`);
}
if (lhDiffCount === 0) console.log('  (no differences in first 5 local headers)');

// ---- Scan ALL entries for local/central size mismatches in original ------
console.log('\n=== ORIGINAL PAK: local vs central dir size mismatches (all entries) ===');
let mismatchCount = 0;
for (const oe of origCD) {
  const oh = readLocalHeader(origBuf, oe.localOff);
  if (oe.compSize !== oh.compSize || oe.uncompSize !== oh.uncompSize) {
    console.log(`  ${oe.name}: central compSize=${oe.compSize} local compSize=${oh.compSize} | central uncompSize=${oe.uncompSize} local uncompSize=${oh.uncompSize}`);
    mismatchCount++;
  }
}
if (mismatchCount === 0) console.log('  (none — all local headers match central directory)');
else console.log(`  Total mismatches: ${mismatchCount}`);

// ---- Check if any extra bytes exist in original local headers -----------
console.log('\n=== ORIGINAL PAK: entries with non-zero extra field in LOCAL headers ===');
let extraCount = 0;
for (const oe of origCD) {
  const oh = readLocalHeader(origBuf, oe.localOff);
  if (oh.extraLen > 0) {
    console.log(`  ${oe.name}: extraLen=${oh.extraLen}  bytes=${oh.extraBytes.toString('hex')}`);
    extraCount++;
  }
}
if (extraCount === 0) console.log('  (none)');

// ---- Verify data integrity: recompute CRC for first entry ---------------
console.log('\n=== FIRST ENTRY DATA INTEGRITY ===');
{
  const oe = origCD[0];
  const re = rebuiltCD[0];
  const oh = readLocalHeader(origBuf, oe.localOff);
  const rh = readLocalHeader(rebuiltBuf, re.localOff);
  const origData    = origBuf.subarray(oh.dataOffset, oh.dataOffset + oe.compSize);
  const rebuiltData = rebuiltBuf.subarray(rh.dataOffset, rh.dataOffset + re.compSize);
  const match = origData.equals(rebuiltData);
  console.log(`  Compressed data identical: ${match}`);
  if (!match) {
    console.log(`  orig bytes[0..15]:    ${origData.subarray(0,16).toString('hex')}`);
    console.log(`  rebuilt bytes[0..15]: ${rebuiltData.subarray(0,16).toString('hex')}`);
  }
}

// ---- Check ordering: are original central dir entries sorted by localOff? -
console.log('\n=== ORIGINAL PAK: central dir entry order vs local header order ===');
const sortedByLocalOff = [...origCD].sort((a, b) => a.localOff - b.localOff);
let orderMismatch = 0;
for (let i = 0; i < origCD.length; i++) {
  if (origCD[i].name !== sortedByLocalOff[i].name) {
    if (orderMismatch < 5)
      console.log(`  Position ${i}: central="${origCD[i].name}" vs localOff-sorted="${sortedByLocalOff[i].name}"`);
    orderMismatch++;
  }
}
if (orderMismatch === 0) console.log('  Central dir order matches local header order (no reordering needed).');
else console.log(`  ${orderMismatch} entries out of order — rebuilt PAK may have wrong central dir order!`);

console.log('\nDone.');