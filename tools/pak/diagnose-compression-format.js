/**
 * Check whether method=8 entries in original PAK use zlib format or raw deflate.
 * zlib format: starts with 0x78 0x?? (CMF/FLG header)
 * raw deflate: starts with BTYPE bits (no fixed header)
 *
 * Also verify: does inflateSync vs inflateRawSync work on the original data?
 */
import fs from "fs";
import zlib from "zlib";
import { readPakIndex, extractEntry } from "../lib/pak.js";

const PAK = 'data-game-park/gamedata.pak';
const index = readPakIndex(PAK);
const buf = index.buffer;

// Find EOCD and read central dir
let eocdOff = buf.length - 22;
while (buf.readUInt32LE(eocdOff) !== 0x06054b50) eocdOff--;
const totalEntries  = buf.readUInt16LE(eocdOff + 10);
const centralOffset = buf.readUInt32LE(eocdOff + 16);

// Read entries
const entries = [];
let off = centralOffset;
for (let i = 0; i < totalEntries; i++) {
  const nameLen    = buf.readUInt16LE(off + 28);
  const extraLen   = buf.readUInt16LE(off + 30);
  const commentLen = buf.readUInt16LE(off + 32);
  entries.push({
    localOff: buf.readUInt32LE(off + 42),
    compSize: buf.readUInt32LE(off + 20),
    uncompSize: buf.readUInt32LE(off + 24),
    method: buf.readUInt16LE(off + 10),
    name: buf.subarray(off + 46, off + 46 + nameLen).toString(),
    nameLen, extraLen,
  });
  off += 46 + nameLen + extraLen + commentLen;
}

// Sample 5 method=8 entries and check their compressed data header bytes
console.log('=== Compressed data format check (first 5 method=8 entries) ===');
const deflated = entries.filter(e => e.method === 8).slice(0, 5);
for (const e of deflated) {
  const lOff    = e.localOff;
  const lNameLen = buf.readUInt16LE(lOff + 26);
  const lExtraLen = buf.readUInt16LE(lOff + 28);
  const dataOff = lOff + 30 + lNameLen + lExtraLen;
  const compData = buf.subarray(dataOff, dataOff + e.compSize);

  const firstBytes = compData.subarray(0, 8).toString('hex');
  const isZlibHeader = (compData[0] === 0x78) &&
    ([0x01, 0x5E, 0x9C, 0xDA].includes(compData[1]));

  console.log(`\n${e.name}`);
  console.log(`  compSize=${e.compSize}  first8bytes=${firstBytes}`);
  console.log(`  Looks like zlib header (0x78 0x??): ${isZlibHeader}`);

  // Try inflateSync (zlib format)
  try {
    const out = zlib.inflateSync(compData);
    console.log(`  inflateSync: OK (${out.length} bytes)`);
  } catch (err) {
    console.log(`  inflateSync: FAIL — ${err.message}`);
  }

  // Try inflateRawSync (raw deflate)
  try {
    const out = zlib.inflateRawSync(compData);
    console.log(`  inflateRawSync: OK (${out.length} bytes)`);
  } catch (err) {
    console.log(`  inflateRawSync: FAIL — ${err.message}`);
  }
}

// Test re-compression of scenes.win.bmd specifically
const TARGET = 'libs/class3/contentmanager/scenes.win.bmd';
const targetEntry = index.entries.find(e => e.name === TARGET);
if (targetEntry) {
  console.log(`\n=== scenes.win.bmd re-compression test ===`);
  const origCompData = (() => {
    const lOff = targetEntry.localHeaderOffset;
    const lNameLen = buf.readUInt16LE(lOff + 26);
    const lExtraLen = buf.readUInt16LE(lOff + 28);
    const dataOff = lOff + 30 + lNameLen + lExtraLen;
    return buf.subarray(dataOff, dataOff + targetEntry.compressedSize);
  })();

  console.log(`Original compSize=${origCompData.length}`);
  console.log(`Original first 8 bytes: ${origCompData.subarray(0, 8).toString('hex')}`);

  // Decompress with inflateSync
  let uncompData;
  try {
    uncompData = zlib.inflateSync(origCompData);
    console.log(`inflateSync decompressed: ${uncompData.length} bytes`);
  } catch (e) {
    console.log(`inflateSync failed: ${e.message}`);
    try {
      uncompData = zlib.inflateRawSync(origCompData);
      console.log(`inflateRawSync decompressed: ${uncompData.length} bytes`);
    } catch (e2) {
      console.log(`inflateRawSync also failed: ${e2.message}`);
    }
  }

  if (uncompData) {
    // Re-compress with deflateSync (zlib)
    const recompZlib = zlib.deflateSync(uncompData);
    console.log(`deflateSync (zlib) result: ${recompZlib.length} bytes, first8=${recompZlib.subarray(0,8).toString('hex')}`);

    // Re-compress with deflateRawSync
    const recompRaw = zlib.deflateRawSync(uncompData);
    console.log(`deflateRawSync (raw) result: ${recompRaw.length} bytes, first8=${recompRaw.subarray(0,8).toString('hex')}`);

    // Verify round-trips
    try {
      const rtZlib = zlib.inflateSync(recompZlib);
      console.log(`deflateSync round-trip via inflateSync: ${rtZlib.equals(uncompData) ? 'OK' : 'MISMATCH'}`);
    } catch (e) { console.log(`deflateSync round-trip via inflateSync: FAIL ${e.message}`); }

    try {
      const rtZlibRaw = zlib.inflateRawSync(recompZlib);
      console.log(`deflateSync round-trip via inflateRawSync: ${rtZlibRaw.equals(uncompData) ? 'OK' : 'MISMATCH'}`);
    } catch (e) { console.log(`deflateSync round-trip via inflateRawSync: FAIL ${e.message}`); }

    try {
      const rtRawRaw = zlib.inflateRawSync(recompRaw);
      console.log(`deflateRawSync round-trip via inflateRawSync: ${rtRawRaw.equals(uncompData) ? 'OK' : 'MISMATCH'}`);
    } catch (e) { console.log(`deflateRawSync round-trip via inflateRawSync: FAIL ${e.message}`); }

    try {
      const rtRawZlib = zlib.inflateSync(recompRaw);
      console.log(`deflateRawSync round-trip via inflateSync: ${rtRawZlib.equals(uncompData) ? 'OK' : 'MISMATCH'}`);
    } catch (e) { console.log(`deflateRawSync round-trip via inflateSync: FAIL ${e.message}`); }
  }
}
