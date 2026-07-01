import fs from "node:fs";
import zlib from "node:zlib";

export function readSwfLike(filePath) {
  const source = fs.readFileSync(filePath);
  const signature = source.subarray(0, 3).toString("ascii");
  const version = source[3];
  const fileLength = source.readUInt32LE(4);

  let body;
  let normalizedSignature;

  if (signature === "GFX" || signature === "FWS") {
    normalizedSignature = "FWS";
    body = source;
  } else if (signature === "CFX" || signature === "CWS") {
    normalizedSignature = "CWS";
    const inflated = zlib.inflateSync(source.subarray(8));
    body = Buffer.concat([Buffer.from(`FWS${String.fromCharCode(version)}`, "binary"), source.subarray(4, 8), inflated]);
  } else {
    throw new Error(`Unsupported SWF/GFX signature: ${signature}`);
  }

  const header = parseSwfHeader(body);
  const tags = parseTags(body, header.tagOffset, body.length);

  return {
    filePath,
    signature,
    normalizedSignature,
    version,
    fileLength,
    buffer: body,
    header,
    tags,
  };
}

export function collectTags(tags, predicate, results = []) {
  for (const tag of tags) {
    if (predicate(tag)) results.push(tag);
    if (tag.tags) collectTags(tag.tags, predicate, results);
  }
  return results;
}

function parseSwfHeader(buffer) {
  let bitOffset = 8 * 8;
  const nbits = readUb(buffer, bitOffset, 5);
  bitOffset += 5;
  bitOffset += nbits * 4;
  const rectBits = 5 + nbits * 4;
  const rectBytes = Math.ceil(rectBits / 8);
  const rectOffset = 8;
  const frameRateOffset = rectOffset + rectBytes;
  const frameCountOffset = frameRateOffset + 2;
  const tagOffset = frameCountOffset + 2;

  return {
    rectOffset,
    frameRateOffset,
    frameCountOffset,
    tagOffset,
  };
}

function parseTags(buffer, startOffset, maxOffset) {
  const tags = [];
  let offset = startOffset;

  while (offset < maxOffset) {
    const recordHeader = buffer.readUInt16LE(offset);
    const code = recordHeader >> 6;
    let length = recordHeader & 0x3f;
    let headerSize = 2;
    if (length === 0x3f) {
      length = buffer.readUInt32LE(offset + 2);
      headerSize = 6;
    }

    const contentOffset = offset + headerSize;
    const endOffset = contentOffset + length;
    if (endOffset > maxOffset) {
      throw new Error(`Tag ${code} overruns buffer at ${offset}`);
    }

    const raw = buffer.subarray(offset, endOffset);
    const content = buffer.subarray(contentOffset, endOffset);
    const tag = {
      code,
      length,
      offset,
      headerSize,
      contentOffset,
      endOffset,
      raw,
    };

    parseKnownTag(tag, content);
    tags.push(tag);
    offset = endOffset;

    if (code === 0) break;
  }

  return tags;
}

function parseKnownTag(tag, content) {
  if (tag.code === 39) {
    const spriteId = content.readUInt16LE(0);
    const frameCount = content.readUInt16LE(2);
    tag.spriteId = spriteId;
    tag.frameCount = frameCount;
    tag.tags = parseTags(content, 4, content.length);
    return;
  }

  if (tag.code === 48 || tag.code === 75) {
    parseDefineFont2Or3(tag, content);
    return;
  }

  if (tag.code === 37) {
    parseDefineEditText(tag, content);
    return;
  }

  if (tag.code === 56 || tag.code === 76) {
    parseExports(tag, content);
    return;
  }

  if (tag.code === 57 || tag.code === 71) {
    parseImports(tag, content);
  }
}

function parseDefineFont2Or3(tag, content) {
  let offset = 0;
  tag.fontId = content.readUInt16LE(offset);
  offset += 2;

  const flags1 = content[offset++];
  tag.fontFlags = {
    hasLayout: Boolean(flags1 & 0x80),
    shiftJis: Boolean(flags1 & 0x40),
    smallText: Boolean(flags1 & 0x20),
    ansi: Boolean(flags1 & 0x10),
    wideOffsets: Boolean(flags1 & 0x08),
    wideCodes: Boolean(flags1 & 0x04),
    italic: Boolean(flags1 & 0x02),
    bold: Boolean(flags1 & 0x01),
  };

  tag.languageCode = content[offset++];
  const fontNameLen = content[offset++];
  tag.fontName = content.subarray(offset, offset + fontNameLen).toString("latin1");
  offset += fontNameLen;

  const numGlyphs = content.readUInt16LE(offset);
  offset += 2;
  tag.numGlyphs = numGlyphs;

  const offsetEntrySize = tag.fontFlags.wideOffsets ? 4 : 2;
  const codeEntrySize = tag.fontFlags.wideCodes ? 2 : 1;
  const offsetTableSize = numGlyphs * offsetEntrySize;
  const codeTableOffsetOffset = offset + offsetTableSize;
  const codeTableOffset = tag.fontFlags.wideOffsets
    ? content.readUInt32LE(codeTableOffsetOffset)
    : content.readUInt16LE(codeTableOffsetOffset);

  const codeTableStart = offset + codeTableOffset;
  tag.codePoints = [];
  for (let index = 0; index < numGlyphs; index += 1) {
    const entryOffset = codeTableStart + index * codeEntrySize;
    const codePoint = tag.fontFlags.wideCodes ? content.readUInt16LE(entryOffset) : content[entryOffset];
    tag.codePoints.push(codePoint);
  }
}

function parseDefineEditText(tag, content) {
  let offset = 0;
  tag.characterId = content.readUInt16LE(offset);
  offset += 2;

  offset = skipRect(content, offset);

  const flags1 = content[offset++];
  const flags2 = content[offset++];

  const hasText = Boolean(flags1 & 0x80);
  const wordWrap = Boolean(flags1 & 0x40);
  const multiline = Boolean(flags1 & 0x20);
  const password = Boolean(flags1 & 0x10);
  const readOnly = Boolean(flags1 & 0x08);
  const hasTextColor = Boolean(flags1 & 0x04);
  const hasMaxLength = Boolean(flags1 & 0x02);
  const hasFont = Boolean(flags1 & 0x01);

  const hasFontClass = Boolean(flags2 & 0x80);
  const autoSize = Boolean(flags2 & 0x40);
  const hasLayout = Boolean(flags2 & 0x20);
  const noSelect = Boolean(flags2 & 0x10);
  const border = Boolean(flags2 & 0x08);
  const html = Boolean(flags2 & 0x02);
  const useOutlines = Boolean(flags2 & 0x01);

  tag.editTextFlags = {
    hasText,
    wordWrap,
    multiline,
    password,
    readOnly,
    hasTextColor,
    hasMaxLength,
    hasFont,
    hasFontClass,
    autoSize,
    hasLayout,
    noSelect,
    border,
    html,
    useOutlines
  };

  if (hasFont) {
    tag.fontId = content.readUInt16LE(offset);
    offset += 2;
  }

  if (hasFontClass) {
    tag.fontClassOffset = offset;
    const parsed = readCString(content, offset);
    tag.fontClass = parsed.value;
    offset = parsed.nextOffset;
  }

  if (hasFont || hasFontClass) {
    tag.fontHeight = content.readUInt16LE(offset);
    offset += 2;
  }

  if (hasTextColor) {
    offset += 4; // RGBA color
  }

  if (hasMaxLength) {
    offset += 2;
  }

  if (hasLayout) {
    offset += 1 + 2 + 2 + 2 + 2;
  }

  const variableName = readCString(content, offset);
  tag.variableName = variableName.value;
  offset = variableName.nextOffset;

  if (hasText) {
    const initialText = readCString(content, offset);
    tag.initialText = initialText.value;
    offset = initialText.nextOffset;
  }
}


function parseExports(tag, content) {
  let offset = 0;
  const count = content.readUInt16LE(offset);
  offset += 2;
  tag.exports = [];

  for (let index = 0; index < count; index += 1) {
    const characterId = content.readUInt16LE(offset);
    offset += 2;
    const parsed = readCString(content, offset);
    offset = parsed.nextOffset;
    tag.exports.push({ characterId, name: parsed.value });
  }
}

function parseImports(tag, content) {
  let offset = 0;
  const url = readCString(content, offset);
  offset = url.nextOffset;

  if (tag.code === 71) {
    tag.importFlags = {
      hasDigest: Boolean(content[offset] & 0x01),
      useNetwork: Boolean(content[offset] & 0x02),
    };
    offset += 1;
    offset += 1;
  }

  const count = content.readUInt16LE(offset);
  offset += 2;

  tag.importUrl = url.value;
  tag.imports = [];

  for (let index = 0; index < count; index += 1) {
    const characterId = content.readUInt16LE(offset);
    offset += 2;
    const parsed = readCString(content, offset);
    offset = parsed.nextOffset;
    tag.imports.push({ characterId, name: parsed.value });
  }
}

function skipRect(buffer, offset) {
  const nbits = readUb(buffer, offset * 8, 5);
  const totalBits = 5 + nbits * 4;
  return offset + Math.ceil(totalBits / 8);
}

function readCString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) {
    end += 1;
  }
  return {
    value: buffer.subarray(offset, end).toString("latin1"),
    nextOffset: end + 1,
  };
}

function readUb(buffer, bitOffset, bitLength) {
  let value = 0;
  for (let index = 0; index < bitLength; index += 1) {
    const absoluteBit = bitOffset + index;
    const byteIndex = absoluteBit >> 3;
    const bitIndex = 7 - (absoluteBit & 7);
    const bit = (buffer[byteIndex] >> bitIndex) & 1;
    value = (value << 1) | bit;
  }
  return value;
}
