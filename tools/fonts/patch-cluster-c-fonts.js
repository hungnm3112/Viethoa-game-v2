import path from "node:path";
import { loadArialSourceFont, patchEmbeddedFonts } from "../lib/font-replacer.js";

const SOURCE_GFX = "input/gamedata/libs/ui/class3_pause.gfx";
const OUTPUT_ROOT = "output/gamedata/libs/ui";
const SOURCE_FONT_NAME = "Arial";

const TARGETS = [
  {
    input: "input/gamedata/libs/ui/class3_journal.gfx",
    fonts: ["Decaying Kuntry", "BrainsForSale", "ZomNotes"],
  },
  {
    input: "input/gamedata/libs/ui/class3_stats.gfx",
    fonts: ["Decaying Kuntry"],
  },
];

const sourceFont = loadArialSourceFont(SOURCE_GFX, SOURCE_FONT_NAME);

for (const target of TARGETS) {
  const outputFile = path.join(OUTPUT_ROOT, path.basename(target.input));
  const replaced = patchEmbeddedFonts({
    sourceFontTag: sourceFont,
    inputFile: target.input,
    outputFile,
    targetFontNames: target.fonts,
  });

  console.log(`Wrote ${outputFile}`);
  for (const font of replaced) {
    console.log(`- Replaced ${font.fontName} (fontId ${font.fontId}) with ${SOURCE_FONT_NAME} glyphs`);
  }
}
