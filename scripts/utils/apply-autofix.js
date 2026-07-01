import fs from "node:fs";
import { replaceXmlStrings } from "../../tools/lib/strings.js";

function removeAccents(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

const abbrevs = [
  [/Súng trường/gi, "Sung"],
  [/Tiểu liên/gi, "SMG"],
  [/Súng lục/gi, "Luc"],
  [/Súng côn/gi, "Con"],
  [/Shotgun/gi, "SG"],
  [/Nhân vật/gi, "NV"],
  [/Kinh nghiệm/gi, "KN"],
  [/Tối đa/gi, "Max"],
  [/Thể lực/gi, "The luc"],
  [/Sức sống/gi, "Mau"],
  [/của bạn/gi, ""],
  [/Tấn công/gi, "Danh"],
  [/Phòng thủ/gi, "Thu"],
  [/Tự chế/gi, "Tu che"],
  [/Vật phẩm/gi, "Do"],
  [/Trang bị/gi, "Mac"],
  [/Sát thương/gi, "Dmg"],
  [/Nhiệm vụ/gi, "NV"],
  [/Cận chiến/gi, "Can chien"],
  [/Vũ khí/gi, "Vu khi"],
  [/Ảnh hưởng/gi, "Uy tin"]
];

function applyAbbreviation(str) {
  let res = str;
  for (const [regex, replacement] of abbrevs) {
    res = res.replace(regex, replacement);
  }
  return res;
}

const rep = JSON.parse(fs.readFileSync("output/reports/oversize-strings.json", "utf8"));
let autofixNoAccents = 0;
let autofixAbbrev = 0;
let stillHard = 0;
const hardList = [];

for (const file in rep) {
  const translationsMap = new Map();
  const fileOversized = rep[file];

  for (const item of fileOversized) {
    let candidate = removeAccents(item.trans);
    let bytes = Buffer.byteLength(candidate, "utf8");

    if (bytes <= item.origBytes) {
      translationsMap.set(item.trans, candidate); // We replace the OLD Vietnamese with the NEW Vietnamese
      autofixNoAccents++;
    } else {
      candidate = applyAbbreviation(candidate);
      bytes = Buffer.byteLength(candidate, "utf8");
      if (bytes <= item.origBytes) {
        translationsMap.set(item.trans, candidate);
        autofixAbbrev++;
      } else {
        stillHard++;
        hardList.push({ orig: item.orig, trans: item.trans, origBytes: item.origBytes, overflow: bytes - item.origBytes });
      }
    }
  }

  if (translationsMap.size > 0 && fs.existsSync(file)) {
    let xml = fs.readFileSync(file, "utf8");
    // Since replaceXmlStrings matches against the exact string in the XML, 
    // we use the current translation (item.trans) as the source to match!
    xml = replaceXmlStrings(xml, translationsMap);
    fs.writeFileSync(file, xml);
    console.log(`Updated ${translationsMap.size} strings in ${file}`);
  }
}

console.log(`\n--- SUMMARY ---`);
console.log(`Fixed by removing accents: ${autofixNoAccents}`);
console.log(`Fixed by abbreviating: ${autofixAbbrev}`);
console.log(`Still oversized (Hard): ${stillHard}`);

fs.writeFileSync("output/reports/stubborn-strings.json", JSON.stringify(hardList, null, 2));
console.log(`Saved remaining hard strings to output/reports/stubborn-strings.json`);
