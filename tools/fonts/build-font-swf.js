import fs from "node:fs";
import path from "node:path";
import { collectTags, readSwfLike } from "../lib/swf.js";

const SOURCE_GFX = "input/gamedata/libs/ui/class3_pause.gfx";
const OUTPUT_FILE = "output/gamedata/libs/ui/HUD_Font_LocFont.swf";
const SOURCE_FONT_NAME = "Arial";
const EXPORTED_SYMBOL_NAME = "Font_Body";
const EMBEDDED_FONT_NAME = "Font_Body";

const pause = readSwfLike(SOURCE_GFX);
const fonts = collectTags(pause.tags, (tag) => tag.code === 48 || tag.code === 75);
const sourceFont = fonts.find((tag) => normalizeFontName(tag.fontName) === SOURCE_FONT_NAME);

if (!sourceFont) {
  throw new Error(`Could not find embedded ${SOURCE_FONT_NAME} font in ${SOURCE_GFX}`);
}

const movieBody = Buffer.concat([
  encodeRect({ xmin: 0, xmax: 20, ymin: 0, ymax: 20 }),
  Buffer.from([0x00, 0x18]), // frameRate = 24
  writeUInt16LE(1), // frameCount
  buildFontReplacementTag(sourceFont, sourceFont.fontId, EMBEDDED_FONT_NAME),
  encodeExportAssets([{ id: sourceFont.fontId, name: EXPORTED_SYMBOL_NAME }]),
  encodeEndTag(),
]);

const header = Buffer.alloc(8);
header.write("FWS", 0, "ascii");
header[3] = pause.version;
header.writeUInt32LE(header.length + movieBody.length, 4);

const output = Buffer.concat([header, movieBody]);
fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, output);

console.log(`Wrote ${OUTPUT_FILE}`);
console.log(`Exported ${EXPORTED_SYMBOL_NAME} using ${SOURCE_FONT_NAME} (fontId ${sourceFont.fontId}).`);
console.log("Copy this file to:");
console.log("D:\\SteamLibrary\\steamapps\\common\\State of Decay YOSE\\Game\\libs\\ui\\HUD_Font_LocFont.swf");

function buildFontReplacementTag(sourceTag, targetFontId, targetFontName) {
  const content = sourceTag.raw.subarray(sourceTag.headerSize);
  const flags1 = content[2];
  const languageCode = content[3];
  const sourceNameLen = content[4];
  const sourceNameEnd = 5 + sourceNameLen;
  const rest = content.subarray(sourceNameEnd);
  const targetNameBytes = Buffer.from(targetFontName, "latin1");

  const newContent = Buffer.concat([
    writeUInt16LE(targetFontId),
    Buffer.from([flags1, languageCode, targetNameBytes.length]),
    targetNameBytes,
    rest,
  ]);

  return Buffer.concat([encodeTagHeader(sourceTag.code, newContent.length), newContent]);
}

function encodeRect({ xmin, xmax, ymin, ymax }) {
  const values = [xmin, xmax, ymin, ymax];
  const bits = Math.max(1, ...values.map((value) => bitsNeededSigned(value)));
  const totalBits = 5 + bits * 4;
  const totalBytes = Math.ceil(totalBits / 8);
  const buffer = Buffer.alloc(totalBytes);
  let bitOffset = 0;

  writeUb(buffer, bitOffset, 5, bits);
  bitOffset += 5;

  for (const value of values) {
    writeSb(buffer, bitOffset, bits, value);
    bitOffset += bits;
  }

  return buffer;
}

function encodeExportAssets(entries) {
  const contentParts = [writeUInt16LE(entries.length)];
  for (const entry of entries) {
    contentParts.push(writeUInt16LE(entry.id));
    contentParts.push(Buffer.from(`${entry.name}\0`, "latin1"));
  }
  const content = Buffer.concat(contentParts);
  return Buffer.concat([encodeTagHeader(56, content.length), content]);
}

function encodeEndTag() {
  return encodeTagHeader(0, 0);
}

function encodeTagHeader(code, length) {
  if (length < 0x3f) {
    const header = Buffer.alloc(2);
    header.writeUInt16LE((code << 6) | length, 0);
    return header;
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE((code << 6) | 0x3f, 0);
  header.writeUInt32LE(length, 2);
  return header;
}

function writeUInt16LE(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function normalizeFontName(name) {
  return name.replace(/\0+$/, "");
}

function bitsNeededSigned(value) {
  if (value === 0) return 1;
  const abs = Math.abs(value);
  return Math.floor(Math.log2(abs)) + 2;
}

function writeUb(buffer, bitOffset, bitLength, value) {
  for (let index = 0; index < bitLength; index += 1) {
    const absoluteBit = bitOffset + index;
    const byteIndex = absoluteBit >> 3;
    const bitIndex = 7 - (absoluteBit & 7);
    const bit = (value >> (bitLength - index - 1)) & 1;
    buffer[byteIndex] |= bit << bitIndex;
  }
}

function writeSb(buffer, bitOffset, bitLength, value) {
  const maxUnsigned = 1 << bitLength;
  const encoded = value < 0 ? maxUnsigned + value : value;
  writeUb(buffer, bitOffset, bitLength, encoded);
}
