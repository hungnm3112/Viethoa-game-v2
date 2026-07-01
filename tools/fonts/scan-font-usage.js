import fs from "node:fs";
import path from "node:path";
import { readSwfLike, collectTags } from "../lib/swf.js";
import { normalizeFontName } from "../lib/font-replacer.js";

const DEFAULT_GAME_DIR = "D:/SteamLibrary/steamapps/common/State of Decay YOSE/Game";
const targetFont = "Decaying Kuntry";

// Get game directory from args or env or default
const args = process.argv.slice(2);
let gameDir = DEFAULT_GAME_DIR;
if (process.env.SOD_GAME_ROOT) {
  gameDir = process.env.SOD_GAME_ROOT;
}
const gameRootArg = args.find(a => a.startsWith("--game-root="));
if (gameRootArg) {
  gameDir = gameRootArg.slice("--game-root=".length);
}

console.log("=========================================================");
console.log("          State of Decay Font Usage Scanner              ");
console.log("=========================================================");
console.log(`Target Font: "${targetFont}"`);
console.log(`Game Directory: "${gameDir}"\n`);

// 1. Scan GFX files
const gfxPaths = [];

// Check game folder loose ui files
const gameLooseUiDir = path.join(gameDir, "libs/ui");
if (fs.existsSync(gameLooseUiDir)) {
  fs.readdirSync(gameLooseUiDir).forEach(file => {
    if (file.endsWith(".gfx") || file.endsWith(".swf")) {
      gfxPaths.push({ source: "Game Loose UI", path: path.join(gameLooseUiDir, file) });
    }
  });
}

// Check workspace output/gamedata/libs/ui
const wsOutputUiDir = "output/gamedata/libs/ui";
if (fs.existsSync(wsOutputUiDir)) {
  fs.readdirSync(wsOutputUiDir).forEach(file => {
    if (file.endsWith(".gfx") || file.endsWith(".swf")) {
      gfxPaths.push({ source: "Workspace Output", path: path.join(wsOutputUiDir, file) });
    }
  });
}

// Check workspace input/gamedata/libs/ui (original dumped gfx files)
const wsDumpUiDir = "input/gamedata/libs/ui";
if (fs.existsSync(wsDumpUiDir)) {
  fs.readdirSync(wsDumpUiDir).forEach(file => {
    if (file.endsWith(".gfx") || file.endsWith(".swf")) {
      gfxPaths.push({ source: "Original Dump", path: path.join(wsDumpUiDir, file) });
    }
  });
}

const scannedGfx = new Set();
console.log("--- Scanning GFX / SWF Files ---");

for (const { source, path: filePath } of gfxPaths) {
  const normPath = path.resolve(filePath);
  if (scannedGfx.has(normPath)) continue;
  scannedGfx.add(normPath);

  try {
    const swf = readSwfLike(filePath);
    
    // a. Collect all fonts defined in this SWF
    const fontTags = collectTags(swf.tags, tag => tag.code === 48 || tag.code === 75);
    const fontMap = new Map(); // ID -> name
    let fileHasTargetFont = false;
    const embeddedFontsList = [];

    for (const font of fontTags) {
      const name = normalizeFontName(font.fontName);
      fontMap.set(font.fontId, name);
      if (name.toLowerCase() === targetFont.toLowerCase()) {
        fileHasTargetFont = true;
        embeddedFontsList.push(`Embedded Font ID ${font.fontId}: "${name}" (${font.numGlyphs} glyphs)`);
      }
    }

    // b. Collect imports
    const importTags = collectTags(swf.tags, tag => tag.code === 57 || tag.code === 71);
    const importedFontsList = [];
    for (const tag of importTags) {
      for (const imp of tag.imports) {
        if (imp.name.toLowerCase().includes(targetFont.toLowerCase())) {
          fileHasTargetFont = true;
          importedFontsList.push(`Imported Symbol from "${tag.importUrl}": ID ${imp.characterId} -> "${imp.name}"`);
        }
      }
    }

    // c. Collect exports
    const exportTags = collectTags(swf.tags, tag => tag.code === 56 || tag.code === 76);
    const exportedFontsList = [];
    for (const tag of exportTags) {
      for (const exp of tag.exports) {
        if (exp.name.toLowerCase().includes(targetFont.toLowerCase())) {
          fileHasTargetFont = true;
          exportedFontsList.push(`Exported Symbol: ID ${exp.characterId} -> "${exp.name}"`);
        }
      }
    }

    // d. Collect EditText fields
    const editTextTags = collectTags(swf.tags, tag => tag.code === 37);
    const matchingTextFields = [];

    for (const field of editTextTags) {
      let usesTarget = false;
      let fontRefStr = "";

      if (field.editTextFlags.hasFontClass) {
        const cls = field.fontClass ?? "";
        if (cls.toLowerCase().includes(targetFont.toLowerCase())) {
          usesTarget = true;
          fontRefStr = `FontClass: "${cls}"`;
        }
      } else if (field.editTextFlags.hasFont) {
        const name = fontMap.get(field.fontId) ?? `Unknown (ID ${field.fontId})`;
        if (name.toLowerCase().includes(targetFont.toLowerCase())) {
          usesTarget = true;
          fontRefStr = `FontID ${field.fontId}: "${name}"`;
        }
      }

      // Also check if initialText has HTML referring to Decaying Kuntry
      if (field.initialText && field.initialText.toLowerCase().includes(targetFont.toLowerCase())) {
        usesTarget = true;
        fontRefStr += (fontRefStr ? ", " : "") + `HTML Font Reference`;
      }

      if (usesTarget) {
        fileHasTargetFont = true;
        matchingTextFields.push({
          varName: field.variableName || "<no variable name>",
          fontRef: fontRefStr,
          text: field.initialText || "<empty>",
          height: field.fontHeight ?? "N/A"
        });
      }
    }

    if (fileHasTargetFont) {
      console.log(`\n[${source}] File: ${path.basename(filePath)} (${path.relative(".", filePath)})`);
      if (embeddedFontsList.length > 0) {
        embeddedFontsList.forEach(line => console.log(`  - ${line}`));
      }
      if (importedFontsList.length > 0) {
        importedFontsList.forEach(line => console.log(`  - ${line}`));
      }
      if (exportedFontsList.length > 0) {
        exportedFontsList.forEach(line => console.log(`  - ${line}`));
      }
      if (matchingTextFields.length > 0) {
        console.log(`  - EditText fields using this font:`);
        matchingTextFields.forEach(field => {
          console.log(`      * Var: "${field.varName}" (${field.fontRef}, height: ${field.height})`);
          if (field.text !== "<empty>") {
            console.log(`        Text: "${field.text.trim()}"`);
          }
        });
      }
    }
  } catch (err) {
    // console.error(`  Error reading ${path.basename(filePath)}:`, err.message);
  }
}

console.log("\n--- Scanning Translation XML & Jobs ---");
const xmlSearchDirs = ["input", "output", "jobs", "cache"];
let totalXmlMatches = 0;

function scanTextFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanTextFiles(fullPath);
    } else if (file.endsWith(".xml") || file.endsWith(".json") || file.endsWith(".txt") || file.endsWith(".js")) {
      // Avoid scanning large node_modules or output paks or binary dumps
      if (fullPath.includes("node_modules") || fullPath.includes("gfxdump") || fullPath.includes("paks")) continue;
      
      const content = fs.readFileSync(fullPath, "utf8");
      if (content.toLowerCase().includes(targetFont.toLowerCase())) {
        totalXmlMatches++;
        console.log(`Match found in: ${fullPath}`);
        // Print lines containing the match
        const lines = content.split(/\r?\n/);
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(targetFont.toLowerCase())) {
            console.log(`  Line ${idx + 1}: ${line.trim().substring(0, 120)}`);
          }
        });
      }
    }
  }
}

xmlSearchDirs.forEach(scanTextFiles);
if (totalXmlMatches === 0) {
  console.log("No translation XML/JSON references to the target font found.");
}

console.log("\nScanning complete.");
