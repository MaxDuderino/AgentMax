# Installs the Agent Lineup into your personal Claude Code folders,
# so every lineup skill and subagent works in every repo.
# Run from the AgentMax folder:  powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$claude = Join-Path $HOME ".claude"
$agents = Join-Path $claude "agents"
New-Item -ItemType Directory -Force -Path $agents | Out-Null

Get-ChildItem -Directory $here | Where-Object { Test-Path (Join-Path $_.FullName "SKILL.md") } | ForEach-Object {
  $dest = Join-Path $claude "skills\$($_.Name)"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Recurse -Force (Join-Path $_.FullName "*") $dest
  Write-Host "Skill installed: $($_.Name)"
}
# Retired skills (the Art Factory became Content Factory MAX on 2026-10-17)
foreach ($old in @("art-factory")) { $p = Join-Path $claude "skills\$old"; if (Test-Path $p) { Remove-Item -Recurse -Force $p; Write-Host "Removed retired skill: $old (now content-factory-max)" } }
# Retired agent files (seat 01 was renamed DuderMax on 2026-10-16)
foreach ($old in @("bvd-max-bullis.md")) { $p = Join-Path $agents $old; if (Test-Path $p) { Remove-Item -Force $p; Write-Host "Removed retired agent: $old" } }
Copy-Item -Force (Join-Path $here "claude-code\agents\*.md") $agents
Write-Host "Subagents installed to $agents (11 BVD seats, 9 testers, 3 QA roles)"
Write-Host "Restart Claude Code, then try: /session-kickoff or /bvd"
