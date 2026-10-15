# Updates the Agent Lineup: pulls the latest from GitHub, then reinstalls.
# Run from the AgentMax folder: right-click -> Run with PowerShell,
# or: powershell -ExecutionPolicy Bypass -File update.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

if (-not (Test-Path (Join-Path $here ".git"))) {
  Write-Host "This folder came from a ZIP download, so it can't update itself."
  Write-Host "Download a fresh ZIP from GitHub (green Code button -> Download ZIP), unzip it over this folder, then run install.ps1."
  Read-Host "Press Enter to close"
  exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git isn't on this computer's PATH. In GitHub Desktop: Repository -> Pull, then run install.ps1."
  Read-Host "Press Enter to close"
  exit 1
}

$before = (git rev-parse --short HEAD).Trim()
git pull --ff-only
if ($LASTEXITCODE -ne 0) {
  Write-Host "Couldn't pull the update. If you changed files in this folder, GitHub Desktop will show them. Discard or commit them, then try again."
  Read-Host "Press Enter to close"
  exit 1
}
$after = (git rev-parse --short HEAD).Trim()

if ($before -eq $after) { Write-Host "Already up to date ($after). Reinstalling anyway, just in case." }
else { Write-Host "Updated $before -> $after. What changed:"; git log --oneline "$before..$after" }

& (Join-Path $here "install.ps1")
Read-Host "Done. Press Enter to close"
