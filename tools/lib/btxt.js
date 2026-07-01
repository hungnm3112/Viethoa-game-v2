import fs from "node:fs";

const MAGIC = "TXDB";

export function parseBtxt(buffer, filePath = "<buffer>") {
  if (buffer.length < 16) {
    throw new Error(`${filePath}: BTXT file is too small.`);
  }

  const magic = buffer.subarray(0, 4).toString("ascii");
  if (magic !== MAGIC) {
    throw new Error(`${filePath}: invalid BTXT magic ${JSON.stringify(magic)}.`);
  }

  const version = buffer.readUInt32LE(4);
  const reserved = buffer.readUInt32LE(8);
  const count = buffer.readUInt32LE(12);
  const textStart = 16 + count * 4;
  if (textStart > buffer.length) {
    throw new Error(`${filePath}: hash table extends past end of file.`);
  }

  const hashes = [];
  for (let index = 0; index < count; index += 1) {
    hashes.push(buffer.readUInt32LE(16 + index * 4));
  }

  const strings = [];
  let cursor = textStart;
  while (cursor < buffer.length) {
    const end = buffer.indexOf(0, cursor);
    if (end === -1) {
      throw new Error(`${filePath}: unterminated string at byte ${cursor}.`);
    }
    strings.push(buffer.subarray(cursor, end).toString("utf8"));
    cursor = end + 1;
  }

  return {
    magic,
    version,
    reserved,
    count,
    textStart,
    hashes,
    strings,
    headerAndHashTable: Buffer.from(buffer.subarray(0, textStart)),
    originalLength: buffer.length,
  };
}

export function readBtxt(filePath) {
  return parseBtxt(fs.readFileSync(filePath), filePath);
}

export function buildBtxt(parsed, strings) {
  if (strings.length !== parsed.count) {
    throw new Error(`BTXT string count mismatch: ${strings.length} != ${parsed.count}.`);
  }

  const parts = [parsed.headerAndHashTable];
  for (const value of strings) {
    parts.push(Buffer.from(String(value), "utf8"), Buffer.from([0]));
  }
  return Buffer.concat(parts);
}

export function validateBtxtBuffer(buffer, filePath = "<buffer>") {
  const parsed = parseBtxt(buffer, filePath);
  const issues = [];

  if (parsed.version !== 1) {
    issues.push(`Unexpected version ${parsed.version}.`);
  }
  if (parsed.reserved !== 0) {
    issues.push(`Unexpected reserved field ${parsed.reserved}.`);
  }
  if (parsed.hashes.length !== parsed.count) {
    issues.push(`Hash count mismatch: ${parsed.hashes.length} != ${parsed.count}.`);
  }
  if (parsed.strings.length !== parsed.count) {
    issues.push(`String count mismatch: ${parsed.strings.length} != ${parsed.count}.`);
  }
  if (!parsed.hashes.every((value, index) => index === 0 || value >= parsed.hashes[index - 1])) {
    issues.push("Hash table is not sorted ascending like the source file.");
  }

  return {
    ok: issues.length === 0,
    issues,
    summary: {
      magic: parsed.magic,
      version: parsed.version,
      reserved: parsed.reserved,
      count: parsed.count,
      textStart: parsed.textStart,
      length: buffer.length,
      strings: parsed.strings.length,
    },
  };
}

export function replaceStrings(strings, replacements, options = {}) {
  const replaceAll = options.replaceAll ?? true;
  const output = [...strings];
  const report = [];

  for (const item of replacements) {
    const sourceText = String(item.sourceText ?? "");
    const translatedText = String(item.translatedText ?? "");
    const matches = [];

    for (let index = 0; index < output.length; index += 1) {
      if (output[index] === sourceText) matches.push(index);
    }

    if (matches.length === 0) {
      report.push({ ...item, status: "missing", matches: [] });
      continue;
    }

    const selected = replaceAll ? matches : matches.slice(0, 1);
    for (const index of selected) {
      output[index] = translatedText;
    }

    report.push({
      ...item,
      status: "patched",
      matches,
      patchedIndexes: selected,
      sourceBytes: Buffer.byteLength(sourceText, "utf8") + 1,
      translatedBytes: Buffer.byteLength(translatedText, "utf8") + 1,
    });
  }

  return { strings: output, report };
}
