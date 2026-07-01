/**
 * Apply same-length translations to all patched BMD files for gamedata.pak.
 *
 * This keeps every original string slot at the same byte length. Longer UTF-8
 * translations are truncated at a valid UTF-8 boundary; shorter translations
 * are padded with spaces. The BMD size therefore remains stable.
 */
import fs from "node:fs";
import path from "node:path";
import { readPakIndex, extractEntry } from "../lib/pak.js";
import { truncateString } from "../../scripts/utils/truncate-strings.js";

const SOURCE_PAK = "data-game-park/gamedata.pak";
const OUTPUT_DIR = "output/gamedata";
const REPORT_FILE = "output/reports/build-all-bmd-samelength-report.json";
const BMD_SIG = 0x55424d44;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || args.has("--check");
const allowOverflow = args.has("--allow-overflow");

const pak = readPakIndex(SOURCE_PAK);
const bmdEntries = pak.entries.filter((entry) => entry.name.endsWith(".bmd"));
console.log(`PAK has ${bmdEntries.length} .bmd entries`);
if (dryRun) console.log("Dry-run: no BMD files will be overwritten.");

const report = {
  generatedAt: new Date().toISOString(),
  sourcePak: SOURCE_PAK,
  outputDir: OUTPUT_DIR,
  dryRun,
  files: [],
  totals: {
    pakBmdEntries: bmdEntries.length,
    filesProcessed: 0,
    applied: 0,
    reverted: 0,
    padded: 0,
    skipped: 0,
  },
};

const WHITELIST = [
  "libs/class3/contentmanager/scenes.win.bmd",
  "libs/class3/contentmanager/missions.win.bmd",
  "libs/class3/contentmanager/hints.win.bmd",
  "libs/class3/contentmanager/activities.win.bmd",
  "libs/class3/contentmanager/todolist.win.bmd",
  "libs/class3/contentmanager/vehicles.win.bmd",
  "libs/class3/community/interactiondefs.win.bmd"
];

for (const entry of bmdEntries) {
  const patchedPath = path.join(OUTPUT_DIR, entry.name);
  if (!fs.existsSync(patchedPath)) continue;

  const isWhitelisted = WHITELIST.some(whitelistPath => entry.name.endsWith(whitelistPath.replace(/\//g, "\\")) || entry.name.endsWith(whitelistPath));
  if (!isWhitelisted) {
    console.log(`[NOT WHITELISTED] Skipping ${entry.name}`);
    continue;
  }

  const origBmd = extractEntry(pak, entry);
  const patchBmd = fs.readFileSync(patchedPath);

  if (origBmd.readUInt32LE(0) !== BMD_SIG) {
    console.warn(`SKIP bad original signature: ${entry.name}`);
    continue;
  }
  if (patchBmd.readUInt32LE(0) !== BMD_SIG) {
    console.warn(`SKIP bad patched signature: ${entry.name}`);
    continue;
  }

  const origTableOff = origBmd.readUInt32LE(20);
  const patchTableOff = patchBmd.readUInt32LE(20);
  const origStrs = readStrings(origBmd, origTableOff);
  const patchStrs = readStrings(patchBmd, patchTableOff);
  const out = Buffer.from(origBmd);
  let applied = 0;
  let reverted = 0;
  let padded = 0;
  let skipped = 0;

function isSafeToTranslate(text) {
  if (text.includes(" ") || text.length === 0) return true;
  if (text.includes("/") || text.includes("\\") || text.includes(".")) return false;
  if (/^[A-Z][a-z]+[A-Z][a-zA-Z]*$/.test(text)) return false; // PascalCase
  if (/^[a-z]+[A-Z][a-zA-Z]*$/.test(text)) return false; // camelCase
  if (/^[A-Z_][A-Z0-9_]*$/.test(text) && text.includes("_")) return false; // UPPER_SNAKE
  if (/^[a-z_][a-z0-9_]*$/.test(text) && text.includes("_")) return false; // lower_snake
  if (text.includes("_")) return false; // Strict filter for underscores
  return true;
}

  for (let i = 0; i < Math.min(origStrs.length, patchStrs.length); i += 1) {
    const orig = origStrs[i];
    const patch = patchStrs[i];
    if (orig.text === patch.text || !isSafeToTranslate(orig.text)) {
      skipped += 1;
      continue;
    }

    const origLen = orig.end - orig.start;
    const transBytes = Buffer.from(patch.text, "utf8");

    if (transBytes.length === origLen) {
      transBytes.copy(out, orig.start);
      applied += 1;
    } else if (transBytes.length < origLen) {
      transBytes.copy(out, orig.start);
      out.fill(0x20, orig.start + transBytes.length, orig.end);
      applied += 1;
      padded += 1;
    } else {
      // NEW RULE: Attempt safe truncation if allowed, otherwise keep original English.
      if (allowOverflow) {
        const truncated = truncateString(patch.text, origLen);
        if (truncated) {
          const truncBytes = Buffer.from(truncated, "utf8");
          truncBytes.copy(out, orig.start);
          if (truncBytes.length < origLen) {
            out.fill(0x20, orig.start + truncBytes.length, orig.end);
          }
          padded += 1; // counted as truncated/padded
        } else {
          // fallback to original English (revert)
          reverted += 1;
        }
      } else {
        // fallback to original English (revert)
        reverted += 1;
      }
    }
  }

  const sameSize = out.length === origBmd.length;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(patchedPath), { recursive: true });
    fs.writeFileSync(patchedPath, out);
  }

  const sizeLabel = sameSize ? "SAME SIZE OK" : `SIZE CHANGED ${origBmd.length} -> ${out.length}`;
  console.log(`${entry.name}: applied=${applied} reverted=${reverted} padded=${padded} skipped=${skipped} ${sizeLabel}`);

  report.files.push({
    entry: entry.name,
    outputBmd: patchedPath.replaceAll("\\", "/"),
    applied,
    reverted,
    padded,
    skipped,
    originalSize: origBmd.length,
    outputSize: out.length,
    sameSize,
  });
  report.totals.filesProcessed += 1;
  report.totals.applied += applied;
  report.totals.reverted += reverted;
  report.totals.padded += padded;
  report.totals.skipped += skipped;
}

fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("");
console.log(`=== Done: ${report.totals.filesProcessed} BMD files processed ===`);
console.log(
  `Total applied: ${report.totals.applied} reverted: ${report.totals.reverted} padded: ${report.totals.padded} skipped: ${report.totals.skipped}`,
);
console.log(`Wrote ${REPORT_FILE}`);
console.log(dryRun ? "Dry-run complete." : "Same-length BMD output updated.");

function readStrings(buf, tableOff) {
  const strs = [];
  let start = tableOff;
  for (let i = tableOff; i < buf.length; i += 1) {
    if (buf[i] === 0) {
      strs.push({ start, end: i, text: buf.toString("utf8", start, i) });
      start = i + 1;
    }
  }
  return strs;
}

function validUtf8CutLength(bytes, maxLen) {
  let cutLen = maxLen;
  while (cutLen > 0 && (bytes[cutLen] & 0xc0) === 0x80) cutLen -= 1;
  return cutLen;
}
