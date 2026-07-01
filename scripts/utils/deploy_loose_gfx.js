import fs from "fs";
import path from "path";
import { readPakIndex, extractEntry } from "../../tools/lib/pak.js";

const gamePakPath = 'D:/SteamLibrary/steamapps/common/State of Decay YOSE/Game/gamedata.pak';
const targetDir = 'D:/SteamLibrary/steamapps/common/State of Decay YOSE/Game/libs/ui';

if (!fs.existsSync(gamePakPath)) {
  console.error(`Game PAK not found: ${gamePakPath}`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
const pak = readPakIndex(gamePakPath);

const gfxFiles = [
  'libs/ui/class3hud.gfx',
  'libs/ui/class3_banners.gfx',
  'libs/ui/class3_centerprompts.gfx',
  'libs/ui/class3_frontend.gfx',
  'libs/ui/class3_journal.gfx',
  'libs/ui/class3_notifications.gfx',
  'libs/ui/class3_pause.gfx',
  'libs/ui/class3_radar.gfx',
  'libs/ui/class3_stats.gfx',
  'libs/ui/class3_survey.gfx',
  'libs/ui/entityflashtag.gfx',
  'libs/ui/menus_confirmation.gfx',
  'libs/ui/menus_startmenu.gfx'
];

console.log('Extracting and deploying patched GFX files to loose folder:');

for (const name of gfxFiles) {
  const entry = pak.entries.find(e => e.name === name);
  if (!entry) {
    console.warn(`  Warning: entry not found in PAK: ${name}`);
    continue;
  }
  
  const buf = extractEntry(pak, entry);
  const targetPath = path.join(targetDir, path.basename(name));
  
  // Backup existing file if any
  if (fs.existsSync(targetPath)) {
    const backupPath = targetPath + '.bak';
    fs.copyFileSync(targetPath, backupPath);
  }
  
  fs.writeFileSync(targetPath, buf);
  console.log(`  Deployed: ${path.basename(name)} (${buf.length} bytes)`);
}

console.log('Loose GFX deployment complete.');
