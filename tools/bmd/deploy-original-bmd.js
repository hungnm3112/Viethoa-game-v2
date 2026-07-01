/**
 * Test script: Deploy the ORIGINAL (unmodified) scenes.win.bmd from PAK as a loose file.
 * If game loads without crash → loose BMD override works, bug is in our patch.
 * If game still crashes → loose BMD override not supported for this file.
 */
import fs from "fs";
import path from "path";
import { extractEntry, readPakIndex } from "../lib/pak.js";

const GAME_DIR = 'D:/SteamLibrary/steamapps/common/State of Decay YOSE/Game';
const TARGET = path.join(GAME_DIR, 'libs/class3/contentmanager/scenes.win.bmd');
const BACKUP_DIR = path.join(GAME_DIR, '_codex_bmd_test_backup');

const pak = readPakIndex('data-game-park/gamedata.pak');
const entry = pak.entries.find(e => e.name === 'libs/class3/contentmanager/scenes.win.bmd');
if (!entry) {
  console.error('scenes.win.bmd not found in PAK');
  process.exit(1);
}

const origBuf = extractEntry(pak, entry);
fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Backup existing if present
if (fs.existsSync(TARGET)) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(TARGET, path.join(BACKUP_DIR, `scenes.win.bmd.${ts}.bak`));
  console.log('Backed up existing file');
}

fs.writeFileSync(TARGET, origBuf);
console.log(`Deployed ORIGINAL scenes.win.bmd (${origBuf.length} bytes) → ${TARGET}`);
console.log('Launch game. If NO crash → loose BMD override works. If crash → game ignores loose BMD.');
