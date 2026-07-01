import { spawnSync } from "node:child_process";

const DEFAULT_MANIFEST = "config/btxt-expanded-pilot.json";

const args = parseArgs(process.argv.slice(2));
const manifest = String(args.manifest ?? DEFAULT_MANIFEST);
const shouldSync = Boolean(args.sync);

runStep("Preview expanded BTXT", [
  "tools/btxt/build-btxt-expanded.js",
  `--manifest=${manifest}`,
  "--dry-run",
]);

runStep("Build expanded BTXT", [
  "tools/btxt/build-btxt-expanded.js",
  `--manifest=${manifest}`,
]);

if (shouldSync) {
  runSyncStep();
} else {
  console.log("Sync skipped. Add --sync to copy the built BTXT language files into the game folder.");
}

console.log("Expanded BTXT workflow completed.");

function runStep(label, nodeArgs) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(process.execPath, nodeArgs, {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runSyncStep() {
  console.log("\n== Sync BTXT language files ==");
  const isWindows = process.platform === "win32";
  const command = isWindows ? "powershell" : "pwsh";
  const result = spawnSync(command, [
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "scripts/sync/sync-btxt-languages-to-game.ps1",
  ], {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const normalizedKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    result[normalizedKey] = inlineValue === undefined ? true : inlineValue;
  }
  return result;
}
