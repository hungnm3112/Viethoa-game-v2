import fs from "node:fs";
import path from "node:path";
import { extractEntry, readPakIndex } from "../lib/pak.js";

const PAK_PATH = "data-game-park/gamedata.pak";
const SOURCE_XML = "input/gamedata/languages/embeddedstrings.xml";
const TRANSLATED_XML = "output/gamedata/languages/embeddedstrings.xml";
const OUTPUT_FILES = [
  {
    entryName: "languages/english.win.btxt",
    outputFile: "output/gamedata/languages/english.win.btxt",
  },
  {
    entryName: "languages/englishau.win.btxt",
    outputFile: "output/gamedata/languages/englishau.win.btxt",
  },
];
const REPORT_FILE = "output/reports/build-btxt-report.json";
const args = parseArgs(process.argv.slice(2));
const includeTranslatedXml = Boolean(args.includeTranslatedXml);

const sourceMap = readEmbeddedTextMap(SOURCE_XML);
const translatedMap = readEmbeddedTextMap(TRANSLATED_XML);
const replacements = [];
const safeMenuOverrides = new Map([
  ["Continue", "Tiếp"],
  ["Start a New Game", "Chơi mới"],
  ["Select Profile", "Hồ sơ"],
  ["Leaderboards", "Xếp hạng"],
  ["Achievements", "Thành tích"],
  ["Help & Options", "Trợ giúp"],
  ["Exit Game", "Thoát"],
  ["START NEW GAME", "CHƠI MỚI"],
  ["Yes", "Có"],
  ["Game Menu", "Menu game"],
  ["Resume Game", "Tiếp"],
  ["Close", "Đóng"],
]);

for (const [id, sourceText] of sourceMap.entries()) {
  const translatedText = safeMenuOverrides.get(sourceText) ?? (includeTranslatedXml ? translatedMap.get(id) : undefined);
  if (!translatedText) continue;
  if (translatedText === sourceText) continue;
  replacements.push({ id, sourceText, translatedText });
}

for (const [sourceText, translatedText] of safeMenuOverrides.entries()) {
  if ([...sourceMap.values()].includes(sourceText)) continue;
  replacements.push({ id: `raw:${sourceText}`, sourceText, translatedText });
}

if (replacements.length === 0) {
  throw new Error("No translated EmbeddedText entries found to patch into english.win.btxt.");
}

const index = readPakIndex(PAK_PATH);
const outputs = OUTPUT_FILES.map((target) => buildTarget(index, target, replacements));

const report = {
  generatedAt: new Date().toISOString(),
  sourceXml: SOURCE_XML,
  translatedXml: TRANSLATED_XML,
  includeTranslatedXml,
  outputs,
};

fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");

for (const output of outputs) {
  console.log(`Wrote ${output.outputFile}`);
}
console.log(`Wrote ${REPORT_FILE}`);
for (const output of outputs) {
  const totals = output.totals;
  console.log(
    `${output.entryName}: patched ${totals.patched}/${totals.candidates}. Missing: ${totals.skippedMissing}. Ambiguous: ${totals.skippedAmbiguous}. Too long: ${totals.skippedTooLong}.`,
  );
}

function buildTarget(index, target, replacements) {
  const entry = index.entries.find((item) => item.name === target.entryName);

  if (!entry) {
    throw new Error(`Could not find ${target.entryName} in gamedata.pak`);
  }

  const patched = extractEntry(index, entry);
  const stats = {
    totalCandidates: replacements.length,
    patched: [],
    skippedMissing: [],
    skippedAmbiguous: [],
    skippedTooLong: [],
  };

  for (const item of replacements) {
    const fromBytes = Buffer.from(`${item.sourceText}\0`, "utf8");
    const toBytes = Buffer.from(`${item.translatedText}\0`, "utf8");
    const matches = findAllMatches(patched, fromBytes);

    if (matches.length === 0) {
      stats.skippedMissing.push(item);
      continue;
    }

    if (matches.length > 1) {
      stats.skippedAmbiguous.push({ ...item, matches: matches.length });
      continue;
    }

    if (toBytes.length > fromBytes.length) {
      stats.skippedTooLong.push({
        ...item,
        sourceBytes: fromBytes.length,
        translatedBytes: toBytes.length,
      });
      continue;
    }

    const offset = matches[0];
    const paddedTextBytes = Buffer.from(item.translatedText, "utf8");
    const paddedLength = fromBytes.length - 1;
    patched.fill(0x20, offset, offset + paddedLength);
    paddedTextBytes.copy(patched, offset);
    patched[offset + paddedLength] = 0;
    stats.patched.push(item);
  }

  fs.mkdirSync(path.dirname(target.outputFile), { recursive: true });
  fs.writeFileSync(target.outputFile, patched);

  return {
    entryName: target.entryName,
    outputFile: target.outputFile,
    totals: {
      candidates: stats.totalCandidates,
      patched: stats.patched.length,
      skippedMissing: stats.skippedMissing.length,
      skippedAmbiguous: stats.skippedAmbiguous.length,
      skippedTooLong: stats.skippedTooLong.length,
    },
    samples: {
      patched: stats.patched.slice(0, 20),
      skippedMissing: stats.skippedMissing.slice(0, 20),
      skippedAmbiguous: stats.skippedAmbiguous.slice(0, 20),
      skippedTooLong: stats.skippedTooLong.slice(0, 20),
    },
  };
}

function readEmbeddedTextMap(filePath) {
  const xml = fs.readFileSync(filePath, "utf8");
  const map = new Map();
  for (const match of xml.matchAll(/<EmbeddedText\b[^>]*\bId=\"([^\"]+)\"[^>]*\bText=\"([^\"]*)\"[^>]*\/>/g)) {
    map.set(match[1], decodeXml(match[2]));
  }
  return map;
}

function decodeXml(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, entity) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return (
      {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: "\"",
        apos: "'",
      }[entity] ?? match
    );
  });
}

function findAllMatches(buffer, needle) {
  const matches = [];
  let offset = 0;
  while (offset < buffer.length) {
    const found = buffer.indexOf(needle, offset);
    if (found === -1) break;
    matches.push(found);
    offset = found + needle.length;
  }
  return matches;
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
