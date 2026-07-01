import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { extractEntry, readPakIndex } from "../lib/pak.js";

const PAK_ROOT = "data-game-park";
const OUTPUT_ROOT = "output";
const OUTPUT_PAK_ROOT = "output/paks";
const REPORT_FILE = "output/reports/build-pak-report.json";

const args = parseArgs(process.argv.slice(2));
const pakNames = String(args.pak ?? "gamedata")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const excludePatterns = String(args.exclude ?? "")
  .split(",")
  .map((value) => value.trim().replaceAll("\\", "/").toLowerCase())
  .filter(Boolean);
const CRC_TABLE = createCrcTable();

const report = {
  generatedAt: new Date().toISOString(),
  paks: [],
};

for (const pakName of pakNames) {
  const sourcePakPath = path.join(PAK_ROOT, `${pakName}.pak`);
  const replacementRoot = path.join(OUTPUT_ROOT, pakName);
  const outputPakName = args.outputName ? String(args.outputName) : pakName;
  const outputPakPath = path.join(OUTPUT_PAK_ROOT, `${outputPakName}.pak`);

  if (!fs.existsSync(sourcePakPath)) {
    throw new Error(`Missing source PAK: ${sourcePakPath}`);
  }

  if (!fs.existsSync(replacementRoot)) {
    throw new Error(`Missing replacement root: ${replacementRoot}`);
  }

  const index = readPakIndex(sourcePakPath);
  const replacements = args.noReplacements ? new Map() : loadReplacementMap(replacementRoot);
  const entryNames = new Set(index.entries.map((entry) => entry.name));
  const unusedReplacementNames = new Set([...replacements.keys()].filter((name) => !entryNames.has(name)));
  const output = buildPak(index, replacements, excludePatterns);

  fs.mkdirSync(path.dirname(outputPakPath), { recursive: true });
  fs.writeFileSync(outputPakPath, output.buffer);

  report.paks.push({
    pak: pakName,
    sourcePak: sourcePakPath.replaceAll("\\", "/"),
    outputPak: outputPakPath.replaceAll("\\", "/"),
    entries: index.entries.length,
    replacedEntries: output.replacedEntries,
    excludedReplacementEntries: output.excludedReplacementEntries,
    excludePatterns,
    size: output.buffer.length,
    unusedReplacements: [...unusedReplacementNames].slice(0, 50),
    samples: output.samples,
  });

  console.log(`Built ${outputPakPath} with ${output.replacedEntries} replaced entr${output.replacedEntries === 1 ? "y" : "ies"}.`);
}

fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`Wrote ${REPORT_FILE}`);

function buildPak(index, replacements, excludedPatterns = []) {
  const localParts = [];
  const centralParts = [];
  const samples = [];
  const payloads = new Map();
  let offset = 0;
  let replacedEntries = 0;
  let excludedReplacementEntries = 0;

  const localOrder = [...index.entries].sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);

  for (let entryIndex = 0; entryIndex < localOrder.length; entryIndex += 1) {
    const entry = localOrder[entryIndex];
    const payload = prepareEntryPayload(index, entry, replacements, excludedPatterns);
    const paddingLength = entryIndex === 0 ? 0 : bytesToAlign(offset + 30 + payload.nameBytes.length, 4096);
    const localHeaderOffset = offset + paddingLength;
    payload.localHeaderOffset = localHeaderOffset;
    payloads.set(entry.name, payload);

    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(payload.sourceLocal.versionNeeded, 4);
    localHeader.writeUInt16LE(payload.sourceLocal.flags, 6);
    localHeader.writeUInt16LE(payload.method, 8);
    localHeader.writeUInt16LE(payload.sourceLocal.modTime, 10);
    localHeader.writeUInt16LE(payload.sourceLocal.modDate, 12);
    localHeader.writeUInt32LE(payload.crc, 14);
    localHeader.writeUInt32LE(payload.compressed.length, 18);
    localHeader.writeUInt32LE(payload.uncompressedSize, 22);
    localHeader.writeUInt16LE(payload.nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    if (paddingLength > 0) {
      localParts.push(Buffer.alloc(paddingLength));
    }
    localParts.push(localHeader, payload.nameBytes, payload.compressed);

    if (payload.replacementPath) {
      replacedEntries += 1;
      if (samples.length < 30) {
        samples.push({
          entry: entry.name,
          source: payload.replacementPath.replaceAll("\\", "/"),
          size: payload.uncompressedSize,
        });
      }
    } else if (payload.excluded) {
      excludedReplacementEntries += 1;
    }

    offset = localHeaderOffset + localHeader.length + payload.nameBytes.length + payload.compressed.length;
  }

  const centralOffset = offset;

  for (const entry of index.entries) {
    const payload = payloads.get(entry.name);
    if (!payload) {
      throw new Error(`Missing local payload for ${entry.name}`);
    }

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(payload.sourceLocal.flags, 8);
    centralHeader.writeUInt16LE(payload.method, 10);
    centralHeader.writeUInt16LE(payload.sourceLocal.modTime, 12);
    centralHeader.writeUInt16LE(payload.sourceLocal.modDate, 14);
    centralHeader.writeUInt32LE(payload.crc, 16);
    centralHeader.writeUInt32LE(payload.compressed.length, 20);
    centralHeader.writeUInt32LE(payload.uncompressedSize, 24);
    centralHeader.writeUInt16LE(payload.centralNameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(payload.localHeaderOffset, 42);

    centralParts.push(centralHeader, payload.centralNameBytes);
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(index.entries.length, 8);
  end.writeUInt16LE(index.entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return {
    buffer: Buffer.concat([...localParts, centralDirectory, end]),
    replacedEntries,
    excludedReplacementEntries,
    samples,
  };
}

function compressForMethod(content, method, entryName) {
  if (method === 0) return content;
  if (method === 8) return zlib.deflateSync(content);
  throw new Error(`Unsupported compression method ${method} for ${entryName}`);
}

function prepareEntryPayload(index, entry, replacements, excludedPatterns) {
  const sourceLocal = readSourceLocalEntry(index, entry);
  const hasReplacement = replacements.has(entry.name);
  const excluded = hasReplacement && matchesAny(entry.name, excludedPatterns);
  const replacementPath = hasReplacement && !excluded ? replacements.get(entry.name) : undefined;
  const content = replacementPath ? fs.readFileSync(replacementPath) : null;
  const compressed = replacementPath ? compressForMethod(content, entry.method, entry.name) : sourceLocal.compressed;

  return {
    sourceLocal,
    nameBytes: sourceLocal.nameBytes,
    centralNameBytes: entry.centralNameBytes ?? sourceLocal.nameBytes,
    method: entry.method,
    compressed,
    crc: replacementPath ? crc32(content) : sourceLocal.crc,
    uncompressedSize: replacementPath ? content.length : entry.uncompressedSize,
    replacementPath,
    excluded,
    localHeaderOffset: 0,
  };
}

function readSourceLocalEntry(index, entry) {
  const buffer = index.buffer;
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`Invalid source local header for ${entry.name}`);
  }

  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  return {
    versionNeeded: buffer.readUInt16LE(offset + 4),
    flags: buffer.readUInt16LE(offset + 6),
    modTime: buffer.readUInt16LE(offset + 10),
    modDate: buffer.readUInt16LE(offset + 12),
    crc: buffer.readUInt32LE(offset + 14),
    nameBytes: Buffer.from(buffer.subarray(offset + 30, offset + 30 + nameLength)),
    compressed: buffer.subarray(dataOffset, dataOffset + entry.compressedSize),
  };
}

function loadReplacementMap(root) {
  const replacements = new Map();
  for (const file of findFiles(root)) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    replacements.set(relative, file);
  }
  return replacements;
}

function findFiles(root) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...findFiles(fullPath));
    } else if (entry.isFile()) {
      output.push(fullPath);
    }
  }
  return output;
}

function matchesAny(entryName, patterns) {
  if (patterns.length === 0) return false;
  const normalized = entryName.replaceAll("\\", "/").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function bytesToAlign(value, alignment) {
  const remainder = value % alignment;
  return remainder === 0 ? 0 : alignment - remainder;
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      result[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}
