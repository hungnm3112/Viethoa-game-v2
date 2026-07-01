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
$pakRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace "output\paks"))

if (-not (Test-Path -LiteralPath $gameRoot)) {
  throw "Game root not found: $gameRoot"
}

if (-not (Test-Path -LiteralPath $pakRoot)) {
  throw "Missing built pak folder: $pakRoot. Run npm run build-game first."
}

$runningGame = Get-Process -Name StateOfDecay -ErrorAction SilentlyContinue
if ($runningGame) {
  throw "StateOfDecay.exe is running. Close the game before deploying pak files."
}

$pakFiles = Get-ChildItem -LiteralPath $pakRoot -File -Filter "gamedata.pak"
if ($pakFiles.Count -eq 0) {
  throw "No built pak files found in $pakRoot. Run npm run build-game first."
}

$backupRoot = Join-Path $gameRoot ("_codex_pak_backup\" + (Get-Date -Format "yyyyMMdd-HHmmss"))

$strayPakBackupRoot = Join-Path $backupRoot "root-strays"
$copied = @()
$backedUp = @()

$movedStrayPaks = @()



foreach ($pattern in @("gamedata.pak.bak", "gamedata.pak.codexbak-*", "gamedata-aligned*.pak")) {
  foreach ($strayPak in Get-ChildItem -LiteralPath $gameRoot -File -Filter $pattern -ErrorAction SilentlyContinue) {
    if (-not (Test-Path -LiteralPath $strayPakBackupRoot)) {
      New-Item -ItemType Directory -Path $strayPakBackupRoot -Force | Out-Null
    }

    $targetStrayPath = Join-Path $strayPakBackupRoot $strayPak.Name
    Move-Item -LiteralPath $strayPak.FullName -Destination $targetStrayPath -Force
    $movedStrayPaks += [PSCustomObject]@{
      Source = $strayPak.FullName
      Backup = $targetStrayPath
      Size = $strayPak.Length
    }
  }
}

foreach ($pakFile in $pakFiles) {
  $sourcePath = [System.IO.Path]::GetFullPath($pakFile.FullName)
  $targetPath = [System.IO.Path]::GetFullPath((Join-Path $gameRoot $pakFile.Name))

  if (-not $sourcePath.StartsWith($pakRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to copy pak outside output/paks: $sourcePath"
  }

  if (-not $targetPath.StartsWith($gameRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to copy pak target outside game root: $targetPath"
  }

  if (Test-Path -LiteralPath $targetPath) {
    $backupPath = Join-Path $backupRoot $pakFile.Name
    $backupDir = Split-Path -Parent $backupPath
    if (-not (Test-Path -LiteralPath $backupDir)) {
      New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }

    Copy-Item -LiteralPath $targetPath -Destination $backupPath -Force
    $backedUp += [PSCustomObject]@{
      Source = $targetPath
      Backup = $backupPath
      Size = (Get-Item -LiteralPath $targetPath).Length
    }
  }

  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
  $copied += [PSCustomObject]@{
    Source = $sourcePath
    Target = $targetPath
    Size = (Get-Item -LiteralPath $sourcePath).Length
  }
}

Write-Output ""
Write-Output "Game root: $gameRoot"
Write-Output "Deployed pak files: $($copied.Count)"

if ($backedUp.Count -gt 0) {
  Write-Output ""
  Write-Output "Backed up original pak files:"
  $backedUp | Format-Table -AutoSize
}



if ($movedStrayPaks.Count -gt 0) {
  Write-Output ""
  Write-Output "Moved stray root pak-like backups:"
  $movedStrayPaks | Format-Table -AutoSize
}

if ($copied.Count -gt 0) {
  Write-Output ""
  Write-Output "Copied pak files:"
  $copied | Format-Table -AutoSize
}
