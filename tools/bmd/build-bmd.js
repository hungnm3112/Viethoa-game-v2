import fs from "node:fs";
import path from "node:path";
import { extractEntry, readPakIndex } from "../lib/pak.js";
import { decodeXml, looksTranslatable, normalizeText } from "../lib/strings.js";

const PAK_ROOT = "data-game-park";
const INPUT_ROOT = "input";
const OUTPUT_ROOT = "output";
const REPORT_FILE = "output/reports/build-bmd-report.json";
const BMD_SIGNATURE = 0x55424d44;

const args = parseArgs(process.argv.slice(2));
const matchers = String(args.match ?? "")
  .split(",")
  .map((value) => value.trim().replaceAll("\\", "/").toLowerCase())
  .filter(Boolean);

const pakIndexes = new Map();
const xmlFiles = findFiles(OUTPUT_ROOT, ".xml")
  .filter((file) => file.replaceAll("\\", "/").startsWith(`${OUTPUT_ROOT}/`))
  .filter((file) => matches(file, matchers));

const report = {
  generatedAt: new Date().toISOString(),
  files: [],
  totals: {
    candidates: 0,
    built: 0,
    skippedNoSourceXml: 0,
    skippedNoPak: 0,
    skippedNoBmd: 0,
    patchedEntries: 0,
    uniquePatchedStrings: 0,
  },
};

for (const translatedXmlPath of xmlFiles) {
  const relativeOutput = path.relative(OUTPUT_ROOT, translatedXmlPath).replaceAll("\\", "/");
  const [pakName, ...entryParts] = relativeOutput.split("/");
  const entryXmlPath = entryParts.join("/");
  if (!pakName || !entryXmlPath) continue;

  const sourceXmlPath = path.join(INPUT_ROOT, pakName, entryXmlPath);
  const pakPath = path.join(PAK_ROOT, `${pakName}.pak`);
  const bmdEntryName = entryXmlPath.replace(/\.xml$/i, ".win.bmd");

  if (!fs.existsSync(sourceXmlPath)) {
    report.totals.skippedNoSourceXml += 1;
    continue;
  }

  if (!fs.existsSync(pakPath)) {
    report.totals.skippedNoPak += 1;
    continue;
  }

  const pakIndex = getPakIndex(pakPath);
  const bmdEntry = pakIndex.entries.find((entry) => entry.name === bmdEntryName);
  if (!bmdEntry) {
    report.totals.skippedNoBmd += 1;
    continue;
  }

  const translations = readXmlTranslationMap(sourceXmlPath, translatedXmlPath);
  if (translations.size === 0) {
    continue;
  }

  const sourceBmd = extractEntry(pakIndex, bmdEntry);
  const patchResult = patchBmdStringTable(sourceBmd, translations);
  if (patchResult.patchedEntries === 0) {
    continue;
  }

  const outputBmdPath = path.join(OUTPUT_ROOT, pakName, bmdEntryName);
  fs.mkdirSync(path.dirname(outputBmdPath), { recursive: true });
  fs.writeFileSync(outputBmdPath, patchResult.buffer);

  const fileReport = {
    sourceXml: sourceXmlPath.replaceAll("\\", "/"),
    translatedXml: translatedXmlPath.replaceAll("\\", "/"),
    sourceBmd: `${pakPath.replaceAll("\\", "/")}:${bmdEntryName}`,
    outputBmd: outputBmdPath.replaceAll("\\", "/"),
    stringTableOffset: patchResult.stringTableOffset,
    translations: translations.size,
    patchedEntries: patchResult.patchedEntries,
    uniquePatchedStrings: patchResult.uniquePatchedStrings,
    missingInBmd: [...patchResult.missingInBmd].slice(0, 20),
    samples: patchResult.samples,
  };

  report.files.push(fileReport);
  report.totals.candidates += translations.size;
  report.totals.built += 1;
  report.totals.patchedEntries += patchResult.patchedEntries;
  report.totals.uniquePatchedStrings += patchResult.uniquePatchedStrings;
}

fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(`Built ${report.totals.built} BMD file(s).`);
console.log(`Patched ${report.totals.patchedEntries} string-table entr${report.totals.patchedEntries === 1 ? "y" : "ies"}.`);
console.log(`Wrote ${REPORT_FILE}`);

function getPakIndex(pakPath) {
  const key = path.normalize(pakPath);
  if (!pakIndexes.has(key)) {
    pakIndexes.set(key, readPakIndex(pakPath));
  }
  return pakIndexes.get(key);
}

function readXmlTranslationMap(sourceXmlPath, translatedXmlPath) {
  const sourceStrings = extractXmlStringOccurrences(fs.readFileSync(sourceXmlPath, "utf8"));
  const translatedStrings = extractXmlStringOccurrences(fs.readFileSync(translatedXmlPath, "utf8"));
  const translations = new Map();
  const count = Math.min(sourceStrings.length, translatedStrings.length);

  for (let index = 0; index < count; index += 1) {
    const source = sourceStrings[index]?.value;
    const translated = translatedStrings[index]?.value;
    if (!source || !translated) continue;
    if (!looksTranslatable(source)) continue;
    if (normalizeText(source) === normalizeText(translated)) continue;
    translations.set(source, translated);
  }

  return translations;
}

function extractXmlStringOccurrences(xml) {
  const results = [];

  for (const match of xml.matchAll(/<Data\b[^>]*>([^<]*)<\/Data>/gim)) {
    results.push({
      value: decodeXml(match[1]),
      kind: "data-node",
    });
  }

  for (const match of xml.matchAll(/([A-Za-z_:.-]*(?:text|title|label|name|desc|description|summary|caption|hint|message)[A-Za-z_:.-]*)\s*=\s*(["'])(.*?)\2/gims)) {
    results.push({
      value: decodeXml(match[3]),
      kind: "attribute",
      attribute: match[1],
    });
  }

  return results;
}

function isBmdIdentifier(text) {
  // Scene response/state tags: <GenericResponse_Confused>
  if (/^<[A-Za-z][A-Za-z0-9_]*>$/.test(text)) return true;
  // Audio clip IDs starting with digits + uppercase keyword: "148 GENERIC Gurubani Kaur"
  if (/^\d+\s+[A-Z]{2,}/.test(text)) return true;
  // No-space single tokens (file paths, enum values, identifiers)
  if (!/\s/.test(text) && /^[\w./\\<>:-]+$/.test(text)) return true;
  return false;
}

function patchBmdStringTable(buffer, translations) {
  if (buffer.readUInt32LE(0) !== BMD_SIGNATURE) {
    throw new Error("Invalid BMD signature.");
  }

  const stringTableOffset = buffer.readUInt32LE(20);
  if (stringTableOffset <= 0 || stringTableOffset >= buffer.length) {
    throw new Error(`Invalid BMD string table offset: ${stringTableOffset}`);
  }

  const output = [buffer.subarray(0, stringTableOffset)];
  const seen = new Set();
  const patchedUnique = new Set();
  const samples = [];
  let patchedEntries = 0;
  let start = stringTableOffset;

  for (let offset = stringTableOffset; offset < buffer.length; offset += 1) {
    if (buffer[offset] !== 0) continue;

    const sourceBytes = buffer.subarray(start, offset);
    const sourceText = sourceBytes.toString("utf8");
    const translatedText = isBmdIdentifier(sourceText) ? undefined : translations.get(sourceText);
    seen.add(sourceText);

    if (translatedText) {
      output.push(Buffer.from(translatedText, "utf8"), Buffer.from([0]));
      patchedEntries += 1;
      patchedUnique.add(sourceText);
      if (samples.length < 20) {
        samples.push({ sourceText, translatedText });
      }
    } else {
      output.push(sourceBytes, Buffer.from([0]));
    }

    start = offset + 1;
  }

  if (start < buffer.length) {
    output.push(buffer.subarray(start));
  }

  const patchedBuffer = Buffer.concat(output);
  patchedBuffer.writeUInt32LE(patchedBuffer.length - stringTableOffset, 24);

  return {
    buffer: patchedBuffer,
    stringTableOffset,
    patchedEntries,
    uniquePatchedStrings: patchedUnique.size,
    missingInBmd: new Set([...translations.keys()].filter((source) => !seen.has(source))),
    samples,
  };
}

function findFiles(root, extension) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...findFiles(fullPath, extension));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
      output.push(fullPath);
    }
  }
  return output;
}

function matches(filePath, patterns) {
  if (patterns.length === 0) return true;
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      result[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}
