#!/usr/bin/env bash
# Installs the Agent Lineup into your personal Claude Code folders,
# so the BVD, Focus Group and QA Team work in every repo.
# Run from the AgentMax folder:  bash install.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/.claude/agents"
for s in bvd focus-group qa-team; do
  mkdir -p "$HOME/.claude/skills/$s"
  cp -R "$here/$s/." "$HOME/.claude/skills/$s/"
  echo "Skill installed: $s"
done
cp "$here"/claude-code/agents/*.md "$HOME/.claude/agents/"
echo "Subagents installed to $HOME/.claude/agents (11 BVD seats, 8 testers, 3 QA roles)"
echo "Restart Claude Code, then try: /bvd, /focus-group or /qa-team"
