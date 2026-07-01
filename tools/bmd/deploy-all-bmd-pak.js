/**
 * Build a gamedata.pak with all same-length patched BMD files.
 *
 * Default behavior is safe: write output/paks/gamedata-all-bmd.pak only.
 * Use --apply to copy it into the game folder after backup.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { readPakIndex } from "../lib/pak.js";

const DEFAULT_GAME_DIR = "D:/SteamLibrary/steamapps/common/State of Decay YOSE/Game";
const SOURCE_PAK = "data-game-park/gamedata.pak";
const OUTPUT_PAK = "output/paks/gamedata-all-bmd.pak";
const OUTPUT_DIR = "output/gamedata";

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const cleanLooseBmd = Boolean(args.cleanLooseBmd);
const gameDir = normalizePath(String(args.gameRoot ?? process.env.SOD_GAME_ROOT ?? DEFAULT_GAME_DIR));
const gamePak = path.join(gameDir, "gamedata.pak");
const backupDir = path.join(gameDir, "_codex_pak_backup");

const CRC_TABLE = buildCrcTable();
const index = readPakIndex(SOURCE_PAK);
console.log(`Source PAK: ${index.entries.length} entries`);
console.log(apply ? "Mode: APPLY to game folder" : "Mode: build output only; pass --apply to deploy");

const replacements = new Map();
for (const entry of index.entries) {
  if (!entry.name.endsWith(".bmd")) continue;
  const patchedPath = path.join(OUTPUT_DIR, entry.name);
  if (fs.existsSync(patchedPath)) {
    replacements.set(entry.name, fs.readFileSync(patchedPath));
  }
}
console.log(`BMD replacements: ${replacements.size} files`);

const { buffer, replaced } = buildPak(index, replacements);
console.log(`Rebuilt PAK: ${buffer.length} bytes, ${replaced} entries replaced`);

fs.mkdirSync(path.dirname(OUTPUT_PAK), { recursive: true });
fs.writeFileSync(OUTPUT_PAK, buffer);
console.log(`Wrote ${OUTPUT_PAK}`);

if (apply) {
  deployToGame();
} else {
  console.log("Dry deployment complete. No game files were changed.");
}

function deployToGame() {
  if (!fs.existsSync(gameDir)) {
    throw new Error(`Game directory not found: ${gameDir}`);
  }
  assertInside(gameDir, gamePak, "game PAK target");
  assertGameNotRunning();

  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `gamedata.pak.${stamp}.bak`);
  if (fs.existsSync(gamePak)) {
    fs.copyFileSync(gamePak, backupPath);
    console.log(`Backed up ${gamePak} -> ${backupPath}`);
  }

  if (cleanLooseBmd) {
    const removed = removeLooseBmd(path.join(gameDir, "libs"));
    console.log(`Removed ${removed} loose .bmd file(s).`);
  } else {
    const loose = listLooseBmd(path.join(gameDir, "libs"));
    if (loose.length > 0) {
      console.log(`WARNING: ${loose.length} loose .bmd file(s) may override the PAK. Use --clean-loose-bmd only when you intentionally want to remove them.`);
      for (const item of loose.slice(0, 20)) console.log(`- ${path.relative(gameDir, item)}`);
      if (loose.length > 20) console.log(`... ${loose.length - 20} more`);
    }
  }

  fs.copyFileSync(OUTPUT_PAK, gamePak);
  console.log(`Deployed PAK -> ${gamePak}`);
}

function buildPak(pakIndex, bmdReplacements) {
  const localParts = [];
  const centralParts = [];
  const payloads = new Map();
  let offset = 0;
  let replaced = 0;
  const localOrder = [...pakIndex.entries].sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);

  for (let i = 0; i < localOrder.length; i += 1) {
    const entry = localOrder[i];
    const sourceLocal = readSourceLocal(pakIndex, entry);
    const replacement = bmdReplacements.get(entry.name);
    let compressed;
    let uncompressedSize;
    let crc32value;

    if (replacement) {
      uncompressedSize = replacement.length;
      compressed = entry.method === 8 ? zlib.deflateSync(replacement, { windowBits: 10 }) : replacement;
      crc32value = crc32(replacement);
      replaced += 1;
    } else {
      compressed = sourceLocal.compressed;
      uncompressedSize = entry.uncompressedSize;
      crc32value = sourceLocal.crc;
    }

    const paddingLength = i === 0 ? 0 : bytesToAlign(offset + 30 + sourceLocal.nameBytes.length, 4096);
    const localHeaderOffset = offset + paddingLength;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(sourceLocal.versionNeeded, 4);
    localHeader.writeUInt16LE(sourceLocal.flags, 6);
    localHeader.writeUInt16LE(entry.method, 8);
    localHeader.writeUInt16LE(sourceLocal.modTime, 10);
    localHeader.writeUInt16LE(sourceLocal.modDate, 12);
    localHeader.writeUInt32LE(crc32value, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(sourceLocal.nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    if (paddingLength > 0) localParts.push(Buffer.alloc(paddingLength));
    localParts.push(localHeader, sourceLocal.nameBytes, Buffer.from(compressed));
    payloads.set(entry.name, { localHeaderOffset, compressed, uncompressedSize, crc32value, sourceLocal, method: entry.method });
    offset = localHeaderOffset + 30 + sourceLocal.nameBytes.length + compressed.length;
  }

  const centralOffset = offset;
  for (const entry of pakIndex.entries) {
    const payload = payloads.get(entry.name);
    const nameBytes = entry.centralNameBytes ?? payload.sourceLocal.nameBytes;
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(payload.sourceLocal.flags, 8);
    centralHeader.writeUInt16LE(payload.method, 10);
    centralHeader.writeUInt16LE(payload.sourceLocal.modTime, 12);
    centralHeader.writeUInt16LE(payload.sourceLocal.modDate, 14);
    centralHeader.writeUInt32LE(payload.crc32value, 16);
    centralHeader.writeUInt32LE(payload.compressed.length, 20);
    centralHeader.writeUInt32LE(payload.uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(payload.localHeaderOffset, 42);
    centralParts.push(centralHeader, nameBytes);
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(pakIndex.entries.length, 8);
  eocd.writeUInt16LE(pakIndex.entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return { buffer: Buffer.concat([...localParts, centralDir, eocd]), replaced };
}

function readSourceLocal(pakIndex, entry) {
  const buf = pakIndex.buffer;
  const off = entry.localHeaderOffset;
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const dataOff = off + 30 + nameLen + extraLen;
  return {
    versionNeeded: buf.readUInt16LE(off + 4),
    flags: buf.readUInt16LE(off + 6),
    modTime: buf.readUInt16LE(off + 10),
    modDate: buf.readUInt16LE(off + 12),
    crc: buf.readUInt32LE(off + 14),
    nameBytes: Buffer.from(buf.subarray(off + 30, off + 30 + nameLen)),
    compressed: buf.subarray(dataOff, dataOff + entry.compressedSize),
  };
}

function listLooseBmd(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...listLooseBmd(full));
    else if (entry.name.toLowerCase().endsWith(".bmd")) results.push(full);
  }
  return results;
}

function removeLooseBmd(dir) {
  const files = listLooseBmd(dir);
  for (const file of files) fs.unlinkSync(file);
  return files.length;
}

function assertGameNotRunning() {
  if (process.platform !== "win32") return;
  const output = execFileSync("tasklist", ["/FI", "IMAGENAME eq StateOfDecay.exe"], { encoding: "utf8" });
  if (/StateOfDecay\.exe/i.test(output)) {
    throw new Error("Game appears to be running. Close State of Decay before deploying PAK files.");
  }
}

function assertInside(rootDir, targetPath, label) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep) && resolvedTarget !== resolvedRoot) {
    throw new Error(`Refusing to write ${label} outside game root: ${resolvedTarget}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === "--apply") parsed.apply = true;
    else if (arg === "--clean-loose-bmd") parsed.cleanLooseBmd = true;
    else if (arg.startsWith("--game-root=")) parsed.gameRoot = arg.slice("--game-root=".length);
  }
  return parsed;
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function bytesToAlign(value, alignment) {
  const remainder = value % alignment;
  return remainder === 0 ? 0 : alignment - remainder;
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
