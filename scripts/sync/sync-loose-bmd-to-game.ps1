$ErrorActionPreference = "Stop"

$workspace = (Resolve-Path ".").Path
$manifestPath = Join-Path $workspace "config\deploy-manifest.json"

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Missing manifest: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$envName = [string]$manifest.gameRootEnv
$defaultRoot = [string]$manifest.defaultGameRoot
$configuredRoot = [Environment]::GetEnvironmentVariable($envName)

if ([string]::IsNullOrWhiteSpace($configuredRoot)) {
  $envFilePath = Join-Path $workspace ".env"
  if (Test-Path -LiteralPath $envFilePath) {
    $envPattern = "^\s*{0}\s*=\s*(.+?)\s*$" -f [regex]::Escape($envName)
    $envLine = Get-Content -LiteralPath $envFilePath | Where-Object { $_ -match $envPattern } | Select-Object -First 1
    if ($envLine -match $envPattern) {
      $configuredRoot = $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
}

if ([string]::IsNullOrWhiteSpace($configuredRoot)) {
  $configuredRoot = $defaultRoot
}

$gameRoot = [System.IO.Path]::GetFullPath($configuredRoot)
$bmdSourceRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace "output\gamedata\libs"))
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $gameRoot "libs"))
$backupRoot = Join-Path $gameRoot ("_codex_loose_bmd_backup\" + (Get-Date -Format "yyyyMMdd-HHmmss"))

if (-not (Test-Path -LiteralPath $gameRoot)) {
  throw "Game root not found: $gameRoot"
}

if (-not (Test-Path -LiteralPath $bmdSourceRoot)) {
  throw "Missing BMD source folder: $bmdSourceRoot"
}

$runningGame = Get-Process -Name StateOfDecay -ErrorAction SilentlyContinue
if ($runningGame) {
  throw "StateOfDecay.exe is running. Close the game before deploying."
}

$copied = 0

# Copy all .bmd files recursively
Get-ChildItem -Path $bmdSourceRoot -Filter "*.bmd" -Recurse | ForEach-Object {
    $sourceFile = $_.FullName
    $relativePath = $_.FullName.Substring($bmdSourceRoot.Length + 1)
    $targetFile = Join-Path $targetRoot $relativePath

    $targetDir = Split-Path -Parent $targetFile
    if (-not (Test-Path -LiteralPath $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }

    if (Test-Path -LiteralPath $targetFile) {
        $backupFile = Join-Path $backupRoot $relativePath
        $backupDir = Split-Path -Parent $backupFile
        if (-not (Test-Path -LiteralPath $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        }
        Copy-Item -LiteralPath $targetFile -Destination $backupFile -Force
    }

    Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
    $copied++
}

Write-Output ""
Write-Output "Game root: $gameRoot"
Write-Output "Deployed loose BMD files (Khu 1): $copied"
