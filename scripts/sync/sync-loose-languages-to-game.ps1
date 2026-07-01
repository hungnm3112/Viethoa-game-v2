$ErrorActionPreference = "Stop"

$workspace = (Resolve-Path ".").Path
$manifestPath = Join-Path $workspace "config\deploy-manifest.json"
$extractOriginalScript = Join-Path $workspace "tools\extract-original-btxt.js"

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Missing manifest: $manifestPath"
}

if (-not (Test-Path -LiteralPath $extractOriginalScript)) {
  throw "Missing original BTXT extractor: $extractOriginalScript"
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
$translatedSourceRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace "output\gamedata\languages"))
$originalSourceRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace "output\original\gamedata\languages"))
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $gameRoot "languages"))
$backupRoot = Join-Path $gameRoot ("_codex_loose_language_backup\" + (Get-Date -Format "yyyyMMdd-HHmmss"))

$translatedXmlFiles = @(
  "embeddedstrings.xml"
)

$originalBtxtFiles = @(
  "english.win.btxt",
  "englishau.win.btxt"
)

if (-not (Test-Path -LiteralPath $gameRoot)) {
  throw "Game root not found: $gameRoot"
}

if (-not (Test-Path -LiteralPath $translatedSourceRoot)) {
  throw "Missing translated language output folder: $translatedSourceRoot"
}

$runningGame = Get-Process -Name StateOfDecay -ErrorAction SilentlyContinue
if ($runningGame) {
  throw "StateOfDecay.exe is running. Close the game before deploying loose language files."
}

if (-not $targetRoot.StartsWith($gameRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to copy loose languages outside game root: $targetRoot"
}

Push-Location $workspace
try {
  & node $extractOriginalScript
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to extract original BTXT files."
  }
}
finally {
  Pop-Location
}

New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null

$copied = @()
$backedUp = @()

function Copy-LanguageFile {
  param(
    [string]$SourceRoot,
    [string]$TargetRoot,
    [string]$FileName,
    [string]$Kind
  )

  $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $SourceRoot $FileName))
  $targetPath = [System.IO.Path]::GetFullPath((Join-Path $TargetRoot $FileName))

  if (-not $sourcePath.StartsWith($SourceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to copy source outside language source root: $sourcePath"
  }

  if (-not $targetPath.StartsWith($TargetRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to copy target outside Game languages: $targetPath"
  }

  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Missing language file: $sourcePath"
  }

  if (Test-Path -LiteralPath $targetPath) {
    $backupPath = Join-Path $backupRoot $FileName
    $backupDir = Split-Path -Parent $backupPath
    if (-not (Test-Path -LiteralPath $backupDir)) {
      New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }

    Copy-Item -LiteralPath $targetPath -Destination $backupPath -Force
    $script:backedUp += [PSCustomObject]@{
      Source = $targetPath
      Backup = $backupPath
      Size = (Get-Item -LiteralPath $targetPath).Length
    }
  }

  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
  $script:copied += [PSCustomObject]@{
    Kind = $Kind
    Source = $sourcePath
    Target = $targetPath
    Size = (Get-Item -LiteralPath $sourcePath).Length
  }
}

foreach ($fileName in $translatedXmlFiles) {
  Copy-LanguageFile -SourceRoot $translatedSourceRoot -TargetRoot $targetRoot -FileName $fileName -Kind "translated-xml"
}

foreach ($fileName in $originalBtxtFiles) {
  Copy-LanguageFile -SourceRoot $originalSourceRoot -TargetRoot $targetRoot -FileName $fileName -Kind "original-btxt"
}

Write-Output ""
Write-Output "Game root: $gameRoot"
Write-Output "Deployed loose language files: $($copied.Count)"
Write-Output "Patched BTXT files from output/gamedata/languages are intentionally NOT deployed."

if ($backedUp.Count -gt 0) {
  Write-Output ""
  Write-Output "Backed up existing loose language files:"
  $backedUp | Format-Table -AutoSize
}

$copied | Format-Table -AutoSize
