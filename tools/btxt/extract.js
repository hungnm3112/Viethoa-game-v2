import fs from "node:fs";
import path from "node:path";
import { extractEntries, listPakEntries } from "../lib/pak.js";

const PAK_ROOT = "data-game-park";
const OUTPUT_ROOT = "input";

const args = parseArgs(process.argv.slice(2));
if (!args.group && process.argv[2] && !process.argv[2].startsWith("--")) {
  args.group = process.argv[2];
}
const includeBtxt = args["include-btxt"] === true;

const wantedPattern = includeBtxt
  ? /\.(xml|win\.btxt|win\.drl|gfx|swf)$/i
  : /\.(xml|gfx|swf)$/i;

let total = 0;

for (const pakFile of fs.readdirSync(PAK_ROOT).filter((name) => name.endsWith(".pak"))) {
  const pakPath = path.join(PAK_ROOT, pakFile);
  const pakName = path.basename(pakFile, ".pak");
  const entries = listPakEntries(pakPath).filter((entry) => wantedPattern.test(entry.name));

  if (args.group) {
    entries.splice(
      0,
      entries.length,
      ...entries.filter((entry) => entry.name.toLowerCase().includes(String(args.group).toLowerCase())),
    );
  }

  const outputRoot = path.join(OUTPUT_ROOT, pakName);
  const written = extractEntries(pakPath, entries, outputRoot);
  total += written.length;
  console.log(`${pakFile}: extracted ${written.length} files`);
}

console.log(`Done. Extracted ${total} files into ${OUTPUT_ROOT}/`);

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
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
