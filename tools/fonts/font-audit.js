import fs from "node:fs";
import path from "node:path";
import { collectTags, readSwfLike } from "../lib/swf.js";

const UI_DIR = "input/gamedata/libs/ui";
const SCRIPTS_DIR = "output/extracted/libs/ui/flashassets/scripts";
const OUTPUT_FILE = "output/reports/font-audit.json";

const assets = fs
  .readdirSync(UI_DIR)
  .filter((name) => /\.(gfx|swf)$/i.test(name))
  .sort()
  .map((name) => auditAsset(path.join(UI_DIR, name)));

const fontShaderFiles = [
  "input/gamedata/fonts/default.xml",
  "input/gamedata/fonts/hud.xml",
  "input/gamedata/fonts/console.xml",
]
  .filter((file) => fs.existsSync(file))
  .map(readFontShader);

const scriptLoads = collectScriptLoads(SCRIPTS_DIR);

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    assets: assets.length,
    assetsWithFonts: assets.filter((asset) => asset.embeddedFonts.length > 0).length,
    assetsWithFontImports: assets.filter((asset) => asset.imports.some((entry) => /font/i.test(entry.name) || /font/i.test(entry.url))).length,
    textFieldsUsingFontClass: assets.reduce((sum, asset) => sum + asset.editTexts.filter((entry) => entry.fontClass).length, 0),
    textFieldsUsingFontId: assets.reduce((sum, asset) => sum + asset.editTexts.filter((entry) => entry.fontId !== null).length, 0),
  },
  fontShaders: fontShaderFiles,
  scriptLoads,
  assets,
};

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(`Wrote ${OUTPUT_FILE}`);
console.log(`Assets scanned: ${report.summary.assets}`);
console.log(`Assets with embedded fonts: ${report.summary.assetsWithFonts}`);
console.log(`Assets with font imports: ${report.summary.assetsWithFontImports}`);

function auditAsset(filePath) {
  const swf = readSwfLike(filePath);
  const fonts = collectTags(swf.tags, (tag) => tag.code === 48 || tag.code === 75);
  const editTexts = collectTags(swf.tags, (tag) => tag.code === 37);
  const importTags = collectTags(swf.tags, (tag) => tag.code === 57 || tag.code === 71);
  const exportTags = collectTags(swf.tags, (tag) => tag.code === 56 || tag.code === 76);

  return {
    file: filePath.replaceAll("\\", "/"),
    signature: swf.signature,
    normalizedSignature: swf.normalizedSignature,
    embeddedFonts: fonts.map((font) => ({
      fontId: font.fontId,
      fontName: normalizeFontName(font.fontName),
      glyphs: font.numGlyphs,
      sampleCodePoints: font.codePoints?.slice(0, 32) ?? [],
    })),
    imports: importTags.flatMap((tag) =>
      (tag.imports ?? []).map((entry) => ({
        url: tag.importUrl,
        characterId: entry.characterId,
        name: entry.name,
      })),
    ),
    exports: exportTags.flatMap((tag) =>
      (tag.exports ?? []).map((entry) => ({
        characterId: entry.characterId,
        name: entry.name,
      })),
    ),
    editTexts: editTexts.map((entry) => ({
      characterId: entry.characterId,
      fontId: entry.fontId ?? null,
      fontClass: entry.fontClass ?? null,
      fontHeight: entry.fontHeight ?? null,
      variableName: sanitize(entry.variableName),
      initialText: sanitize(entry.initialText ?? ""),
    })),
  };
}

function readFontShader(filePath) {
  const xml = fs.readFileSync(filePath, "utf8");
  const match = xml.match(/<font\s+path="([^"]+)"/i);
  return {
    file: filePath.replaceAll("\\", "/"),
    fontPath: match?.[1] ?? null,
  };
}

function collectScriptLoads(rootDir) {
  const files = walk(rootDir).filter((file) => file.endsWith(".as"));
  const results = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const match of content.matchAll(/loadMovie\("([^"]+)"/g)) {
      results.push({
        file: file.replaceAll("\\", "/"),
        target: match[1],
      });
    }
  }

  return results;
}

function walk(rootDir) {
  const results = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function normalizeFontName(value) {
  return String(value ?? "").replace(/\0+$/, "");
}

function sanitize(value) {
  return String(value ?? "").replaceAll("\0", "");
}
