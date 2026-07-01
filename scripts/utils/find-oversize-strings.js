import fs from "node:fs";

function decodeXml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function extractXmlStringOccurrences(xml) {
  const results = [];
  for (const match of xml.matchAll(/<Data\b[^>]*>([^<]*)<\/Data>/gim)) {
    results.push(decodeXml(match[1]));
  }
  for (const match of xml.matchAll(/([A-Za-z_:.-]*(?:text|title|label|name|desc|description|summary|caption|hint|message)[A-Za-z_:.-]*)\s*=\s*(["'])(.*?)\2/gims)) {
    results.push(decodeXml(match[3]));
  }
  return results;
}

function normalizeText(text) {
  return text.trim().replace(/\r\n/g, "\n");
}

function checkFile(inputFile, outputFile) {
  if (!fs.existsSync(inputFile) || !fs.existsSync(outputFile)) return [];
  
  const inXml = fs.readFileSync(inputFile, "utf8");
  const outXml = fs.readFileSync(outputFile, "utf8");
  
  const inStrs = extractXmlStringOccurrences(inXml);
  const outStrs = extractXmlStringOccurrences(outXml);
  
  const count = Math.min(inStrs.length, outStrs.length);
  const oversized = [];
  
  for (let i = 0; i < count; i++) {
    const orig = inStrs[i];
    const trans = outStrs[i];
    
    if (!orig || !trans) continue;
    if (normalizeText(orig) === normalizeText(trans)) continue; // Not translated or same
    
    const origBytes = Buffer.byteLength(orig, "utf8");
    const transBytes = Buffer.byteLength(trans, "utf8");
    
    if (transBytes > origBytes) {
      oversized.push({
        orig,
        trans,
        origBytes,
        transBytes,
        diff: transBytes - origBytes
      });
    }
  }
  return oversized;
}

const filesToCheck = [
  { in: "input/gamedata/libs/class3/contentmanager/hints.xml", out: "output/gamedata/libs/class3/contentmanager/hints.xml" },
  { in: "input/gamedata/libs/class3/contentmanager/todolist.xml", out: "output/gamedata/libs/class3/contentmanager/todolist.xml" },
  { in: "input/gamedata/libs/class3/items/items.xml", out: "output/gamedata/libs/class3/items/items.xml" }
];

let totalOversized = 0;
const report = {};

for (const file of filesToCheck) {
  const over = checkFile(file.in, file.out);
  if (over.length > 0) {
    report[file.out] = over;
    totalOversized += over.length;
  }
}

fs.writeFileSync("output/reports/oversize-strings.json", JSON.stringify(report, null, 2));
console.log(`Found ${totalOversized} oversized strings. Report saved to output/reports/oversize-strings.json`);
