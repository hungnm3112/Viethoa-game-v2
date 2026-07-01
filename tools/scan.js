import fs from "node:fs";
import path from "node:path";
import { extractXmlStrings, groupForPath } from "./lib/strings.js";

const INPUT_ROOT = "input";
const files = findFiles(INPUT_ROOT, ".xml");
const rows = [];
let totalStrings = 0;

for (const file of files) {
  const xml = fs.readFileSync(file, "utf8");
  const strings = extractXmlStrings(xml);
  if (strings.length === 0) continue;

  totalStrings += strings.length;
  rows.push({
    group: groupForPath(file),
    file: file.replaceAll("\\", "/"),
    strings: strings.length,
  });
}

rows.sort((a, b) => {
  const group = a.group.localeCompare(b.group);
  if (group !== 0) return group;
  return b.strings - a.strings;
});

console.table(rows.slice(0, 80));
console.log(`Files with strings: ${rows.length}`);
console.log(`Unique-ish strings by file total: ${totalStrings}`);

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

