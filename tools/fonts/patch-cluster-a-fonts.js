import fs from "node:fs";
import path from "node:path";
import { loadArialSourceFont, patchEmbeddedFonts, patchImportedFont } from "../lib/font-replacer.js";

const SOURCE_GFX = "input/gamedata/libs/ui/class3_pause.gfx";
const SOURCE_FONT_NAME = "Arial";
const FRONTEND_TARGET = {
  input: "input/gamedata/libs/ui/class3_frontend.gfx",
  fonts: ["Decaying Kuntry", "BrainsForSale"],
};
const TARGETS = [
  "input/gamedata/libs/ui/menus_startmenu.gfx",
  "input/gamedata/libs/ui/menus_confirmation.gfx",
  "input/gamedata/libs/ui/entityflashtag.gfx",
];
const OUTPUT_ROOT = "output/gamedata/libs/ui";

const sourceFont = loadArialSourceFont(SOURCE_GFX, SOURCE_FONT_NAME);

patchFrontendTarget(sourceFont);

for (const targetFile of TARGETS) {
  patchTarget(targetFile, sourceFont);
}

function patchFrontendTarget(fontTag) {
  const outputFile = path.join(OUTPUT_ROOT, path.basename(FRONTEND_TARGET.input));
  const replaced = patchEmbeddedFonts({
    sourceFontTag: fontTag,
    inputFile: FRONTEND_TARGET.input,
    outputFile,
    targetFontNames: FRONTEND_TARGET.fonts,
  });

  console.log(`Wrote ${outputFile}`);
  for (const font of replaced) {
    console.log(`- Replaced embedded ${font.fontName} (fontId ${font.fontId}) with ${SOURCE_FONT_NAME} glyphs`);
  }
}

function patchTarget(targetFile, fontTag) {
  const outputFile = path.join(OUTPUT_ROOT, path.basename(targetFile));
  const replacements = patchImportedFont({
    sourceFontTag: fontTag,
    inputFile: targetFile,
    outputFile,
    importName: "Font_Body",
    targetFontName: "Font_Body",
  });

  console.log(`Wrote ${outputFile}`);
  for (const item of replacements) {
    console.log(
      `- Replaced import ${item.importUrl}::Font_Body with embedded ${SOURCE_FONT_NAME} (fontId ${item.characterId})`,
    );
  }
}
