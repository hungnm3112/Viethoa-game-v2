import fs from "node:fs";
import path from "node:path";

const PILOT_MANIFEST = "config/btxt-expanded-pilot.json";
const CHUNKS_DIR = "output/languages/chunks";
const OUTPUT_MANIFEST = "output/languages/master-manifest.json";

console.log("Merging manifests...");

let replacements = [];

// Load pilot manifest
if (fs.existsSync(PILOT_MANIFEST)) {
  const pilot = JSON.parse(fs.readFileSync(PILOT_MANIFEST, "utf8"));
  if (pilot.replacements) {
    replacements.push(...pilot.replacements);
    console.log(`Loaded ${pilot.replacements.length} from ${PILOT_MANIFEST}`);
  }
}

// Load chunks
if (fs.existsSync(CHUNKS_DIR)) {
  const files = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith(".json"));
  
  // Sort files by modified time (newest first) so that recently translated chunks take priority
  files.sort((a, b) => {
    const statA = fs.statSync(path.join(CHUNKS_DIR, a));
    const statB = fs.statSync(path.join(CHUNKS_DIR, b));
    return statB.mtimeMs - statA.mtimeMs;
  });

  for (const file of files) {
    const chunk = JSON.parse(fs.readFileSync(path.join(CHUNKS_DIR, file), "utf8"));
    if (chunk.replacements) {
      // Filter out empty translations
      const valid = chunk.replacements.filter(r => r.translatedText && r.translatedText.trim() !== "");
      replacements.push(...valid);
      console.log(`Loaded ${valid.length} valid translations from ${file}`);
    }
  }
}

const master = {
  description: "Master Manifest (Pilot + Chunks)",
  replaceAll: true,
  replacements
};

fs.writeFileSync(OUTPUT_MANIFEST, JSON.stringify(master, null, 2), "utf8");
console.log(`Successfully merged ${replacements.length} total replacements into ${OUTPUT_MANIFEST}`);
