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
Copy-Item -Force (Join-Path $here "claude-code\agents\*.md") $agents
Write-Host "Subagents installed to $agents (11 BVD seats, 8 testers, 3 QA roles)"
Write-Host "Restart Claude Code, then try: /session-kickoff or /bvd"
