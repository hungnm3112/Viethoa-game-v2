import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export function readPakIndex(pakPath) {
  const buffer = fs.readFileSync(pakPath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== SIG_CENTRAL) {
      throw new Error(`Invalid central directory at ${offset}`);
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const rawName = buffer.subarray(offset + 46, offset + 46 + nameLength);
    const name = rawName
      .toString("utf8")
      .replaceAll("\\", "/");

    entries.push({
      name,
      centralNameBytes: Buffer.from(rawName),
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return { pakPath, buffer, entries };
}

export function listPakEntries(pakPath) {
  return readPakIndex(pakPath).entries;
}

export function extractEntry(index, entry) {
  const buffer = index.buffer;
  const offset = entry.localHeaderOffset;

  if (buffer.readUInt32LE(offset) !== SIG_LOCAL) {
    throw new Error(`Invalid local header for ${entry.name}`);
  }

  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(
    dataOffset,
    dataOffset + entry.compressedSize,
  );

  if (entry.method === 0) {
    return Buffer.from(compressed);
  }

  if (entry.method === 8) {
    const output = zlib.inflateSync(compressed);
    if (output.length !== entry.uncompressedSize) {
      throw new Error(
        `Size mismatch for ${entry.name}: ${output.length} != ${entry.uncompressedSize}`,
      );
    }
    return output;
  }

  throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
}

export function extractEntries(pakPath, entries, outputRoot) {
  const index = readPakIndex(pakPath);
  const wanted = new Map(entries.map((entry) => [entry.name, entry]));
  const written = [];

  for (const entry of index.entries) {
    if (!wanted.has(entry.name) || entry.name.endsWith("/")) {
      continue;
    }

    const outputPath = path.join(outputRoot, entry.name);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, extractEntry(index, entry));
    written.push(outputPath);
  }

  return written;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === SIG_EOCD) {
      return offset;
    }
  }

  throw new Error("End of central directory not found");
}
