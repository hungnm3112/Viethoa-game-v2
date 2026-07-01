import fs from "node:fs";
import path from "node:path";
import { buildBtxt, parseBtxt, replaceStrings, validateBtxtBuffer } from "../lib/btxt.js";
import { extractEntry, readPakIndex } from "../lib/pak.js";

const PAK_PATH = "data-game-park/gamedata.pak";
const DEFAULT_MANIFEST = "config/btxt-expanded-pilot.json";
const REPORT_FILE = "output/reports/build-btxt-expanded-report.json";
const TARGETS = [
  {
    entryName: "languages/english.win.btxt",
    outputFile: "output/gamedata/languages/english.win.btxt",
  },
  {
    entryName: "languages/englishau.win.btxt",
    outputFile: "output/gamedata/languages/englishau.win.btxt",
  },
];

const args = parseArgs(process.argv.slice(2));
const manifestFile = String(args.manifest ?? DEFAULT_MANIFEST);
const dryRun = Boolean(args.dryRun);
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

if (!Array.isArray(manifest.replacements) || manifest.replacements.length === 0) {
  throw new Error(`${manifestFile}: replacements must be a non-empty array.`);
}

const index = readPakIndex(PAK_PATH);
const outputs = TARGETS.map((target) => buildTarget(index, target, manifest, { dryRun }));
const report = {
  generatedAt: new Date().toISOString(),
  mode: "expanded-rebuild",
  manifestFile,
  dryRun,
  manifestDescription: manifest.description ?? "",
  outputs,
};

fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");

for (const output of outputs) {
  if (!dryRun) console.log(`Wrote ${output.outputFile}`);
  console.log(
    `${output.entryName}: patched ${output.totals.patched}/${output.totals.candidates}; missing ${output.totals.missing}; size ${output.originalLength} -> ${output.outputLength}.`,
  );
}
console.log(`Wrote ${REPORT_FILE}`);

function buildTarget(pakIndex, target, manifest, options) {
  const entry = pakIndex.entries.find((item) => item.name === target.entryName);
  if (!entry) {
    throw new Error(`Could not find ${target.entryName} in ${PAK_PATH}.`);
  }

  const sourceBuffer = extractEntry(pakIndex, entry);
  const parsed = parseBtxt(sourceBuffer, target.entryName);
  const sourceValidation = validateBtxtBuffer(sourceBuffer, target.entryName);
  if (!sourceValidation.ok) {
    throw new Error(`${target.entryName}: source validation failed: ${sourceValidation.issues.join("; ")}`);
  }

  const { strings, report: replacementReport } = replaceStrings(parsed.strings, manifest.replacements, {
    replaceAll: manifest.replaceAll !== false,
  });
  const outputBuffer = buildBtxt(parsed, strings);
  const outputValidation = validateBtxtBuffer(outputBuffer, target.outputFile);
  if (!outputValidation.ok) {
    throw new Error(`${target.outputFile}: output validation failed: ${outputValidation.issues.join("; ")}`);
  }

  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(target.outputFile), { recursive: true });
    fs.writeFileSync(target.outputFile, outputBuffer);
  }

  const patched = replacementReport.filter((item) => item.status === "patched");
  const missing = replacementReport.filter((item) => item.status === "missing");
  const expanded = patched.filter((item) => item.translatedBytes > item.sourceBytes);

  return {
    entryName: target.entryName,
    outputFile: target.outputFile,
    originalLength: sourceBuffer.length,
    outputLength: outputBuffer.length,
    deltaBytes: outputBuffer.length - sourceBuffer.length,
    sourceSummary: sourceValidation.summary,
    outputSummary: outputValidation.summary,
    totals: {
      candidates: replacementReport.length,
      patched: patched.length,
      missing: missing.length,
      expanded: expanded.length,
      patchedEntries: patched.reduce((sum, item) => sum + item.patchedIndexes.length, 0),
    },
    samples: {
      patched: patched.slice(0, 20),
      missing: missing.slice(0, 20),
      expanded: expanded.slice(0, 20),
    },
  };
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const normalizedKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    result[normalizedKey] = inlineValue === undefined ? true : inlineValue;
  }
  return result;
}
