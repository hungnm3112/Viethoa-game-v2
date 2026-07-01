const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scratchDir = 'scratch';
const files = fs.readdirSync(scratchDir).filter(f => f.startsWith('translate-') && f.endsWith('.cjs'));

const masterDb = {};

console.log("Building Master Translation DB from scratch...");

for (const file of files) {
  const code = fs.readFileSync(path.join(scratchDir, file), 'utf8');
  
  const fakeFs = {
    existsSync: fs.existsSync,
    readFileSync: fs.readFileSync,
    readdirSync: fs.readdirSync,
    mkdirSync: fs.mkdirSync,
    writeFileSync: (filePath, data) => {
      try {
        const parsed = JSON.parse(data);
        for (const r of parsed.replacements) {
          if (r.translatedText && r.translatedText.trim() !== '') {
            masterDb[r.sourceText] = r.translatedText;
          }
        }
      } catch (e) {
        console.error(`Failed to parse intercepted write in ${file}:`, e.message);
      }
    }
  };

  const sandbox = {
    __dirname: path.resolve(scratchDir),
    require: (mod) => mod === 'fs' ? fakeFs : require(mod),
    console: { log: () => {}, error: console.error }
  };

  try {
    vm.runInNewContext(code, sandbox);
    console.log(`[+] Processed ${file}`);
  } catch (e) {
    console.error(`[!] Error executing ${file}: ${e.message}`);
  }
}

const outDir = 'output/languages';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(path.join(outDir, 'master-translation-db.json'), JSON.stringify(masterDb, null, 2), 'utf8');
console.log(`\n=> Master DB successfully built with ${Object.keys(masterDb).length} unique entries!`);
