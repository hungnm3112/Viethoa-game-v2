/**
 * Scan all GFX files to find which font names are used and what sizes,
 * to determine which need Vietnamese support.
 */
import { readPakIndex, extractEntry } from "../lib/pak.js";

const pak = readPakIndex('data-game-park/gamedata.pak');
const gfxEntries = pak.entries.filter(e => e.name.endsWith('.gfx'));

for (const entry of gfxEntries) {
  const buf = extractEntry(pak, entry);
  const text = buf.toString('latin1');

  const fontSizes = {};
  const rx = /face="([^"]+)" size="(\d+)"/g;
  let m;
  while ((m = rx.exec(text)) !== null) {
    const key = m[1];
    if (!fontSizes[key]) fontSizes[key] = new Set();
    fontSizes[key].add(parseInt(m[2]));
  }

  if (Object.keys(fontSizes).length === 0) continue;

  console.log(`\n${entry.name}:`);
  for (const [face, sizes] of Object.entries(fontSizes)) {
    const len = Buffer.byteLength(face, 'utf8');
    console.log(`  "${face}" (${len} bytes) sizes: ${[...sizes].sort((a,b)=>a-b).join(',')}`);
  }
}
