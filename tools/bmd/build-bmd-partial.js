/**
 * Build a partial-translation scenes.win.bmd for binary-search debugging.
 * Only translates strings with ordinal index in [startIdx, endIdx).
 * Use to isolate which specific string causes a game crash.
 *
 * Usage:
 *   node tools/build-bmd-partial.js --start 0 --end 2000
 *   (translates changed strings #0..#1999; skips #2000+)
 */
import fs from "fs";
import path from "path";
import { readPakIndex, extractEntry } from "../lib/pak.js";
import { decodeXml, looksTranslatable, normalizeText } from "../lib/strings.js";

const args = parseArgs(process.argv.slice(2));
const startIdx = Number(args.start ?? 0);
const endIdx = Number(args.end ?? Infinity);

const BMD_SIGNATURE = 0x55424d44;
const SOURCE_PAK = 'data-game-park/gamedata.pak';
const TARGET_ENTRY = 'libs/class3/contentmanager/scenes.win.bmd';
const SOURCE_XML = 'input/gamedata/libs/class3/contentmanager/scenes.xml';
const TRANSLATED_XML = 'output/gamedata/libs/class3/contentmanager/scenes.xml';
const OUTPUT_BMD = 'output/gamedata/libs/class3/contentmanager/scenes.win.bmd';

const index = readPakIndex(SOURCE_PAK);
const entry = index.entries.find(e => e.name === TARGET_ENTRY);
if (!entry) { console.error('scenes.win.bmd not found in PAK'); process.exit(1); }

const sourceBmd = extractEntry(index, entry);
const translations = buildTranslationMap(SOURCE_XML, TRANSLATED_XML);
console.log(`Translations loaded: ${translations.size}`);
console.log(`Applying only changed strings at ordinal index [${startIdx}, ${endIdx === Infinity ? '∞' : endIdx})`);

const result = patchBmdPartial(sourceBmd, translations, startIdx, endIdx);
console.log(`Patched: ${result.applied} strings applied, ${result.skipped} skipped (out of range)`);
console.log(`Output size: ${result.buffer.length} bytes (original: ${sourceBmd.length})`);

fs.mkdirSync(path.dirname(OUTPUT_BMD), { recursive: true });
fs.writeFileSync(OUTPUT_BMD, result.buffer);
console.log(`Written → ${OUTPUT_BMD}`);
console.log('Now run: node tools/deploy-scenes-bmd-pak.js');

function patchBmdPartial(buffer, translations, startIdx, endIdx) {
  if (buffer.readUInt32LE(0) !== BMD_SIGNATURE) throw new Error('Invalid BMD signature');
  const stringTableOffset = buffer.readUInt32LE(20);

  const output = [buffer.subarray(0, stringTableOffset)];
  let applied = 0, skipped = 0;
  let ordinal = 0;  // counts ALL strings in the table (not just translatable ones)
  let start = stringTableOffset;

  for (let offset = stringTableOffset; offset < buffer.length; offset++) {
    if (buffer[offset] !== 0) continue;

    const sourceBytes = buffer.subarray(start, offset);
    const sourceText = sourceBytes.toString('utf8');

    const inRange = ordinal >= startIdx && ordinal < endIdx;
    const translatedText = inRange ? translations.get(sourceText) : undefined;

    if (translatedText) {
      output.push(Buffer.from(translatedText, 'utf8'), Buffer.from([0]));
      applied++;
    } else {
      output.push(sourceBytes, Buffer.from([0]));
      if (translations.has(sourceText) && !inRange) skipped++;
    }

    ordinal++;
    start = offset + 1;
  }

  if (start < buffer.length) output.push(buffer.subarray(start));

  const patchedBuffer = Buffer.concat(output);
  patchedBuffer.writeUInt32LE(patchedBuffer.length - stringTableOffset, 24);
  return { buffer: patchedBuffer, applied, skipped };
}

function buildTranslationMap(sourceXmlPath, translatedXmlPath) {
  const sourceStrings = extractXmlStrings(fs.readFileSync(sourceXmlPath, 'utf8'));
  const translatedStrings = extractXmlStrings(fs.readFileSync(translatedXmlPath, 'utf8'));
  const map = new Map();
  const count = Math.min(sourceStrings.length, translatedStrings.length);
  for (let i = 0; i < count; i++) {
    const src = sourceStrings[i];
    const tgt = translatedStrings[i];
    if (!src || !tgt) continue;
    if (!looksTranslatable(src)) continue;
    if (normalizeText(src) === normalizeText(tgt)) continue;
    if (isBmdIdentifier(src)) continue;
    map.set(src, tgt);
  }
  return map;
}

function extractXmlStrings(xml) {
  const results = [];
  for (const match of xml.matchAll(/<Data\b[^>]*>([^<]*)<\/Data>/gim)) {
    results.push(decodeXml(match[1]));
  }
  return results;
}

function isBmdIdentifier(text) {
  if (/^<[A-Za-z][A-Za-z0-9_]*>$/.test(text)) return true;
  if (/^\d+\s+[A-Z]{2,}/.test(text)) return true;
  if (!/\s/.test(text) && /^[\w./\\<>:-]+$/.test(text)) return true;
  return false;
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, inline] = arg.slice(2).split('=', 2);
    if (inline !== undefined) { result[key] = inline; continue; }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { result[key] = true; } else { result[key] = next; i++; }
  }
  return result;
}
