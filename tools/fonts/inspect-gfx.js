import { collectTags, readSwfLike } from "../lib/swf.js";

const filePath = process.argv[2];

if (!filePath) {
  throw new Error("Usage: node tools/inspect-gfx.js <path-to-gfx>");
}

const swf = readSwfLike(filePath);
const fonts = collectTags(swf.tags, (tag) => tag.code === 48 || tag.code === 75);
const editTexts = collectTags(swf.tags, (tag) => tag.code === 37);

console.log(`File: ${filePath}`);
console.log(`Signature: ${swf.signature} normalized=${swf.normalizedSignature} version=${swf.version}`);
console.log("");
console.log("Fonts:");
for (const font of fonts) {
  console.log(
    JSON.stringify({
      fontId: font.fontId,
      fontName: font.fontName,
      numGlyphs: font.numGlyphs,
      wideCodes: font.fontFlags?.wideCodes ?? false,
      sampleCodePoints: font.codePoints?.slice(0, 20) ?? [],
    }),
  );
}

console.log("");
console.log("EditTexts:");
for (const editText of editTexts.slice(0, 80)) {
  console.log(
    JSON.stringify({
      characterId: editText.characterId,
      fontId: editText.fontId ?? null,
      fontClass: editText.fontClass ?? null,
      fontHeight: editText.fontHeight ?? null,
      variableName: editText.variableName,
      initialText: editText.initialText ?? null,
    }),
  );
}
