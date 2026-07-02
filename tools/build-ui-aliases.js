import fs from 'node:fs';
import path from 'node:path';

const outDir = 'output/gamedata/libs/ui';

const mappings = [
  { source: 'menus_startmenu.gfx', target: 'Menus_Startmenu.swf' },
  { source: 'menus_confirmation.gfx', target: 'Menus_Confirmation.swf' },
  { source: 'entityflashtag.gfx', target: 'EntityFlashTag.swf' }
];

for (const { source, target } of mappings) {
  const sourcePath = path.join(outDir, source);
  const targetPath = path.join(outDir, target);

  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source file ${sourcePath} does not exist. Run patch-cluster-a first.`);
    process.exit(1);
  }

  fs.copyFileSync(sourcePath, targetPath);
  console.log(`Created alias: ${sourcePath} -> ${targetPath}`);
}
