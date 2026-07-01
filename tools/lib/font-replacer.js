import fs from "node:fs";
import path from "node:path";
import { collectTags, readSwfLike } from "./swf.js";

export function normalizeFontName(name) {
  return String(name ?? "").replace(/\0+$/, "");
}

export function loadArialSourceFont(sourceFile, sourceFontName = "Arial") {
  const swf = readSwfLike(sourceFile);
  const fonts = collectTags(swf.tags, (tag) => tag.code === 48 || tag.code === 75);
  const font = fonts.find((tag) => normalizeFontName(tag.fontName) === sourceFontName);

  if (!font) {
    throw new Error(`Could not find embedded ${sourceFontName} font in ${sourceFile}`);
  }

  return font;
}

export function patchEmbeddedFonts({
  sourceFontTag,
  inputFile,
  outputFile,
  targetFontNames,
}) {
  const swf = readSwfLike(inputFile);
  const targetSet = new Set(targetFontNames.map((name) => normalizeFontName(name)));
  const targets = collectTags(swf.tags, (tag) => tag.code === 48 || tag.code === 75)
    .filter((tag) => targetSet.has(normalizeFontName(tag.fontName)))
    .sort((a, b) => b.offset - a.offset);

  if (targets.length === 0) {
    throw new Error(`No target embedded fonts found in ${inputFile}`);
  }

  let output = swf.buffer;
  for (const target of targets) {
    const replacementTag = buildFontReplacementTag(
      sourceFontTag,
      target.fontId,
      normalizeFontName(target.fontName),
    );
    output = Buffer.concat([output.subarray(0, target.offset), replacementTag, output.subarray(target.endOffset)]);
  }

  output.writeUInt32LE(output.length, 4);

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, output);

  return targets.map((tag) => ({
    fontId: tag.fontId,
    fontName: normalizeFontName(tag.fontName),
  }));
}

export function patchImportedFont({
  sourceFontTag,
  inputFile,
  outputFile,
  importName,
  targetFontName = importName,
}) {
  const swf = readSwfLike(inputFile);
  const importTags = collectTags(swf.tags, (tag) => tag.code === 57 || tag.code === 71).filter((tag) =>
    (tag.imports ?? []).some((entry) => entry.name === importName),
  );

  if (importTags.length === 0) {
    throw new Error(`No ${importName} import found in ${inputFile}`);
  }

  let output = swf.buffer;
  const replacements = [];

  for (const tag of importTags.sort((a, b) => b.offset - a.offset)) {
    const importEntry = tag.imports.find((entry) => entry.name === importName);
    const replacementTag = buildFontReplacementTag(sourceFontTag, importEntry.characterId, targetFontName);
    output = Buffer.concat([output.subarray(0, tag.offset), replacementTag, output.subarray(tag.endOffset)]);
    replacements.push({
      importUrl: tag.importUrl,
      characterId: importEntry.characterId,
      importName,
    });
  }

  output.writeUInt32LE(output.length, 4);

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, output);

  return replacements;
}

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
