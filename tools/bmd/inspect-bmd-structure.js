/**
 * Inspect BMD binary structure to find the string offset table.
 * The string table has known content (null-terminated strings).
 * Any uint32 in the data section whose value falls in [0, stringTableSize)
 * and whose pointed-to position aligns with a null terminator is a string offset.
 */
import fs from "fs";
import { extractEntry, readPakIndex } from "../lib/pak.js";

const pak = readPakIndex('data-game-park/gamedata.pak');
const entry = pak.entries.find(e => e.name === 'libs/class3/contentmanager/scenes.win.bmd');
const buf = extractEntry(pak, entry);

const stringTableOffset = buf.readUInt32LE(20);
const stringTableSize   = buf.readUInt32LE(24);
const stringTableEnd    = stringTableOffset + stringTableSize;

console.log('=== BMD Header ===');
console.log(`File size:         ${buf.length} bytes`);
console.log(`StringTableOffset: ${stringTableOffset}  (0x${stringTableOffset.toString(16)})`);
console.log(`StringTableSize:   ${stringTableSize}  (0x${stringTableSize.toString(16)})`);
console.log(`StringTableEnd:    ${stringTableEnd}  (0x${stringTableEnd.toString(16)})`);
console.log(`Data section:      bytes 28 – ${stringTableOffset - 1}  (${stringTableOffset - 28} bytes)`);
console.log('');

// Print header bytes 0-63 for context
console.log('=== First 64 bytes of BMD (hex) ===');
for (let i = 0; i < Math.min(64, buf.length); i += 16) {
  const hex = buf.subarray(i, i + 16).toString('hex').replace(/(.{2})/g, '$1 ').trim();
  const asc = buf.subarray(i, i + 16).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
  console.log(`  ${String(i).padStart(4, '0')}:  ${hex.padEnd(47)}  ${asc}`);
}

// Print next 64 bytes (often contains counts / sub-section offsets)
console.log('');
console.log('=== Bytes 64-127 ===');
for (let i = 64; i < Math.min(128, buf.length); i += 16) {
  const hex = buf.subarray(i, i + 16).toString('hex').replace(/(.{2})/g, '$1 ').trim();
  const asc = buf.subarray(i, i + 16).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
  console.log(`  ${String(i).padStart(4, '0')}:  ${hex.padEnd(47)}  ${asc}`);
}

// Build a set of null-terminator positions within the string table
// (= valid string end positions relative to stringTableOffset)
const nullPositions = new Set();
for (let i = stringTableOffset; i < Math.min(stringTableEnd, buf.length); i++) {
  if (buf[i] === 0) nullPositions.add(i - stringTableOffset);
}
console.log(`\nNull positions in string table: ${nullPositions.size}`);

// Scan data section for uint32 values that look like string-table offsets
// Strategy: look for values in [0, stringTableSize) that hit right AFTER a null (= start of a string)
// A valid string-start offset is: 0, or (nullPos + 1) for some nullPos
const validStarts = new Set([0]);
for (const npos of nullPositions) validStarts.add(npos + 1);

const dataSection = buf.subarray(28, stringTableOffset);  // skip fixed header fields
let offsetHits = 0;
let offsetMisses = 0;
const sampleHits = [];
const sampleMisses = [];

for (let i = 0; i + 3 < dataSection.length; i += 4) {
  const v = dataSection.readUInt32LE(i);
  if (v < stringTableSize) {
    if (validStarts.has(v)) {
      offsetHits++;
      if (sampleHits.length < 5) sampleHits.push({ pos: 28 + i, value: v });
    } else {
      offsetMisses++;
      if (sampleMisses.length < 5) sampleMisses.push({ pos: 28 + i, value: v });
    }
  }
}

console.log(`\n=== String offset scan (data section bytes 28–${stringTableOffset - 1}) ===`);
console.log(`uint32 values in [0, stringTableSize) that start a string: ${offsetHits}`);
console.log(`uint32 values in [0, stringTableSize) that DON'T start a string: ${offsetMisses}`);
if (sampleHits.length > 0) {
  console.log('Sample hits (potential string offsets):');
  for (const h of sampleHits) {
    const strEnd = buf.indexOf(0, stringTableOffset + h.value);
    const str = buf.toString('utf8', stringTableOffset + h.value, strEnd);
    console.log(`  at file offset ${h.pos}: value=${h.value} → "${str.slice(0, 60)}"`);
  }
}
if (sampleMisses.length > 0) {
  console.log('Sample non-string-start values (probably not offsets):');
  for (const m of sampleMisses) {
    console.log(`  at file offset ${m.pos}: value=${m.value}`);
  }
}

// Check if the data section is structured as a sequence of fixed-size records
// by looking at evenly spaced uint32 references
console.log('\n=== Looking for sequential string offset arrays ===');
// Find first sequence of N consecutive uint32 where each points to a valid string start
// and values are non-decreasing
let bestRunStart = -1, bestRunLen = 0;
let runStart = -1, runLen = 0;
let lastVal = -1;
for (let i = 0; i + 3 < dataSection.length; i += 4) {
  const v = dataSection.readUInt32LE(i);
  if (v < stringTableSize && validStarts.has(v) && v >= lastVal) {
    if (runStart < 0) { runStart = 28 + i; runLen = 1; }
    else runLen++;
    lastVal = v;
    if (runLen > bestRunLen) { bestRunLen = runLen; bestRunStart = runStart; }
  } else {
    runStart = -1; runLen = 0; lastVal = -1;
  }
}
console.log(`Longest non-decreasing string offset run: ${bestRunLen} entries starting at file offset ${bestRunStart}`);
if (bestRunLen > 10) {
  console.log('>>> This looks like a STRING OFFSET TABLE <<<');
  console.log(`    Offset table: file offset ${bestRunStart}, ${bestRunLen} entries × 4 bytes = ${bestRunLen * 4} bytes`);
}
