import fs from "node:fs";
import path from "node:path";
import { readSwfLike } from "../lib/swf.js";
import { loadArialSourceFont } from "../lib/font-replacer.js";

const SOURCE_GFX = "input/gamedata/libs/ui/class3_pause.gfx";
const OUTPUT_ROOT = "output/gamedata/libs/ui";
const SOURCE_FONT_NAME = "Arial";

const TARGETS = [
  "input/gamedata/libs/ui/class3hud.gfx",
  "input/gamedata/libs/ui/class3_notifications.gfx",
  "input/gamedata/libs/ui/class3_radar.gfx",
  "input/gamedata/libs/ui/class3_banners.gfx",
  "input/gamedata/libs/ui/class3_centerprompts.gfx",
  "input/gamedata/libs/ui/class3_survey.gfx"
];

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

const sourceFont = loadArialSourceFont(SOURCE_GFX, SOURCE_FONT_NAME);
const TARGET_FONTS = ["Decaying Kuntry", "BrainsForSale", "ZomNotes"];

for (const targetFile of TARGETS) {
  if (!fs.existsSync(targetFile)) {
    console.warn(`Target not found: ${targetFile}`);
    continue;
  }

  const swf = readSwfLike(targetFile);
  
  // Find tags 1005 that contain our target fonts
  const tagsToDrop = new Set();
  const fontIdsToInject = {};

  for (const tag of swf.tags) {
    if (tag.code === 1005) {
      for (const fontName of TARGET_FONTS) {
        if (tag.raw.includes(Buffer.from(fontName, "latin1"))) {
          tagsToDrop.add(tag);
          // GFx font ID might be at offset 0 of content (like Tag 48)
          const fontId = tag.raw.readUInt16LE(tag.headerSize);
          fontIdsToInject[fontName] = fontId;
        }
      }
    }
  }

  if (tagsToDrop.size === 0) {
    console.log(`No compact fonts found in ${path.basename(targetFile)}`);
    continue;
  }

  // Rebuild the SWF replacing dropped tags with injected ones IN PLACE
  let finalBuffer = swf.buffer.subarray(0, swf.header.tagOffset);

  for (const tag of swf.tags) {
    if (tagsToDrop.has(tag)) {
      // It's a Tag 1005 we are dropping. We inject the corresponding Tag 48 here instead.
      for (const fontName of TARGET_FONTS) {
        if (tag.raw.includes(Buffer.from(fontName, "latin1"))) {
          const fontId = tag.raw.readUInt16LE(tag.headerSize);
          const newTag = buildFontReplacementTag(sourceFont, fontId, fontName);
          finalBuffer = Buffer.concat([finalBuffer, newTag]);
          console.log(`- Dropped Tag 1005 and Injected Tag 48 for ${fontName} (fontId ${fontId})`);
        }
      }
    } else {
      finalBuffer = Buffer.concat([finalBuffer, tag.raw]);
    }
  }

  // Update SWF file size in header (offset 4)
  finalBuffer.writeUInt32LE(finalBuffer.length, 4);
  
  const outputFile = path.join(OUTPUT_ROOT, path.basename(targetFile));
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, finalBuffer);
  
  console.log(`Wrote ${outputFile}`);
}
