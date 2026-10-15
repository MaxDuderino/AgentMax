# Installs the Agent Lineup into your personal Claude Code folders,
# so the BVD, Focus Group and QA Team work in every repo.
# Run from the AgentMax folder:  powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$claude = Join-Path $HOME ".claude"
$agents = Join-Path $claude "agents"
New-Item -ItemType Directory -Force -Path $agents | Out-Null

foreach ($s in @("bvd", "focus-group", "qa-team")) {
  $dest = Join-Path $claude "skills\$s"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Recurse -Force (Join-Path $here "$s\*") $dest
  Write-Host "Skill installed: $s"
}
Copy-Item -Force (Join-Path $here "claude-code\agents\*.md") $agents
Write-Host "Subagents installed to $agents (11 BVD seats, 8 testers, 3 QA roles)"
Write-Host "Restart Claude Code, then try: /bvd, /focus-group or /qa-team"
