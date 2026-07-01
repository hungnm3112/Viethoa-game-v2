import { readPakIndex, extractEntry } from "../lib/pak.js";

const pak = readPakIndex('data-game-park/gamedata.pak');
const gfxEntries = pak.entries.filter(e => e.name.endsWith('.gfx'));
const fontNames = new Set();

for (const entry of gfxEntries) {
  const buf = extractEntry(pak, entry);
  const text = buf.toString('latin1');
  // HTML font face tags
  const rx = /face="([^"]+)"/g;
  let m;
  while ((m = rx.exec(text)) !== null) fontNames.add(m[1]);
}

console.log('Font faces used across all GFX files:');
for (const f of fontNames) console.log(' ', f);

// Deeper: look for embedded font names in class3_pause.gfx
const pauseGfx = pak.entries.find(e => e.name === 'libs/ui/class3_pause.gfx');
const buf = extractEntry(pak, pauseGfx);

console.log('\nGFX header bytes 0-16:', buf.subarray(0,16).toString('hex'));

// Scan for printable strings >= 4 chars that look like font names
const text = buf.toString('latin1');
const printable = /[\x20-\x7e]{4,}/g;
let m2;
const candidates = [];
while ((m2 = printable.exec(text)) !== null) {
  const s = m2[0];
  if (/font|Font|FONT/i.test(s) || /Regular|Bold|Italic|Medium|Light/i.test(s)) {
    candidates.push({ at: m2.index, s: s.slice(0,80) });
    if (candidates.length >= 30) break;
  }
}
console.log('\nFont-related strings in class3_pause.gfx:');
candidates.forEach(c => console.log('  @' + c.at + ': ' + c.s));
