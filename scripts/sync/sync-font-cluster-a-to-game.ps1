param(
  [string]$GameRoot = $env:SOD_GAME_ROOT
)

$ErrorActionPreference = "Stop"

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($GameRoot)) {
  $GameRoot = "D:\SteamLibrary\steamapps\common\State of Decay YOSE\Game"
}

$gameRootPath = [System.IO.Path]::GetFullPath($GameRoot)
$sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace "output\gamedata\libs\ui"))
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $gameRootPath "libs\ui"))
$files = @(
  "class3_frontend.gfx",
  "menus_startmenu.gfx",
  "menus_confirmation.gfx",
  "entityflashtag.gfx",
  "HUD_Font_LocFont.swf",
  "Menus_Startmenu.swf",
  "Menus_Confirmation.swf",
  "EntityFlashTag.swf"
)

if (-not (Test-Path -LiteralPath $gameRootPath)) {
  throw "Game root not found: $gameRootPath"
}

if (-not $targetRoot.StartsWith($gameRootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to copy font files outside game root: $targetRoot"
}

foreach ($fileName in $files) {
  $source = Join-Path $sourceRoot $fileName
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing Cluster A font output: $source. Run npm run patch-cluster-a, npm run build-font-swf, and npm run build-ui-aliases first."
  }
}

$gameProcess = Get-Process | Where-Object {
  $_.ProcessName -like "*StateOfDecay*" -or $_.ProcessName -like "*State of Decay*"
} | Select-Object -First 1

if ($gameProcess) {
  throw "Game appears to be running (PID $($gameProcess.Id)). Close the game before syncing Cluster A font files."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $gameRootPath "_codex_cluster_a_font_backup\$stamp"
New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

foreach ($fileName in $files) {
  $target = Join-Path $targetRoot $fileName
  if (Test-Path -LiteralPath $target) {
    Copy-Item -LiteralPath $target -Destination (Join-Path $backupRoot $fileName) -Force
  }
}

foreach ($fileName in $files) {
  $source = Join-Path $sourceRoot $fileName
  $target = Join-Path $targetRoot $fileName
  Copy-Item -LiteralPath $source -Destination $target -Force
  Write-Output "Copied $fileName"
}

Write-Output "Backup: $backupRoot"
Write-Output "Synced Cluster A font files only."
