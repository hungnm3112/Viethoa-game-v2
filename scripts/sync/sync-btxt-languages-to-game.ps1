param(
  [string]$GameRoot = $env:SOD_GAME_ROOT
)

$ErrorActionPreference = "Stop"

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($GameRoot)) {
  $GameRoot = "D:\SteamLibrary\steamapps\common\State of Decay YOSE\Game"
}

$gameRootPath = [System.IO.Path]::GetFullPath($GameRoot)
$sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace "output\gamedata\languages"))
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $gameRootPath "languages"))
$files = @("english.win.btxt", "englishau.win.btxt")

if (-not (Test-Path -LiteralPath $gameRootPath)) {
  throw "Game root not found: $gameRootPath"
}

if (-not $targetRoot.StartsWith($gameRootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to copy BTXT files outside game root: $targetRoot"
}

foreach ($fileName in $files) {
  $source = Join-Path $sourceRoot $fileName
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing built BTXT file: $source"
  }
}

$gameProcess = Get-Process | Where-Object {
  $_.ProcessName -like "*StateOfDecay*" -or $_.ProcessName -like "*State of Decay*"
} | Select-Object -First 1

if ($gameProcess) {
  throw "Game appears to be running (PID $($gameProcess.Id)). Close the game before syncing BTXT files."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $gameRootPath "_codex_btxt_expanded_backup\$stamp"
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
Write-Output "Synced expanded BTXT language files only."
