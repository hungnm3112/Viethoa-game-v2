import fs from "node:fs";
import path from "node:path";

const CACHE_PATH = path.resolve('cache/translations.json');

console.log('Reading cache...');
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
let updatedCount = 0;

for (const [eng, data] of Object.entries(cache)) {
  if (data && typeof data === 'object') {
    const enBytes = Buffer.from(eng, 'utf8').length;
    const viBytes = Buffer.from(data.t || '', 'utf8').length;
    
    // Only update if missing or incorrect
    if (data.enBytes !== enBytes || data.viBytes !== viBytes) {
      data.enBytes = enBytes;
      data.viBytes = viBytes;
      updatedCount++;
    }
  }
}

if (updatedCount > 0) {
  console.log(`Writing cache... (Updated ${updatedCount} entries)`);
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  console.log('Done!');
} else {
  console.log('No updates needed. Cache already has up-to-date byte counts.');
}
