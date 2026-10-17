#!/usr/bin/env bash
# Installs the Agent Lineup into your personal Claude Code folders,
# so every lineup skill and subagent works in every repo.
# Run from the AgentMax folder:  bash install.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/.claude/agents"
for d in "$here"/*/; do
  s="$(basename "$d")"
  [ -f "$d/SKILL.md" ] || continue
  mkdir -p "$HOME/.claude/skills/$s"
  cp -R "$d." "$HOME/.claude/skills/$s/"
  echo "Skill installed: $s"
done
# Retired skills (the Art Factory became Content Factory MAX on 2026-10-17)
for old in art-factory; do [ -d "$HOME/.claude/skills/$old" ] && rm -rf "$HOME/.claude/skills/$old" && echo "Removed retired skill: $old (now content-factory-max)"; done
# Retired agent files (seat 01 was renamed DuderMax on 2026-10-16)
for old in bvd-max-bullis.md; do [ -f "$HOME/.claude/agents/$old" ] && rm -f "$HOME/.claude/agents/$old" && echo "Removed retired agent: $old"; done
cp "$here"/claude-code/agents/*.md "$HOME/.claude/agents/"
echo "Subagents installed to $HOME/.claude/agents (11 BVD seats, 9 testers, 3 QA roles)"
echo "Restart Claude Code, then try: /session-kickoff or /bvd"
