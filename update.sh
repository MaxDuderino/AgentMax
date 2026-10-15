#!/usr/bin/env bash
# Updates the Agent Lineup: pulls the latest from GitHub, then reinstalls.
# Run from the AgentMax folder:  bash update.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
if [ ! -d .git ]; then
  echo "This folder came from a ZIP download, so it can't update itself."
  echo "Download a fresh ZIP from GitHub, unzip it over this folder, then run install.sh."
  exit 1
fi
before="$(git rev-parse --short HEAD)"
if ! git pull --ff-only; then
  echo "Couldn't pull the update. If you changed files in this folder, discard or commit them, then try again."
  exit 1
fi
after="$(git rev-parse --short HEAD)"
if [ "$before" = "$after" ]; then echo "Already up to date ($after). Reinstalling anyway."
else echo "Updated $before -> $after. What changed:"; git log --oneline "$before..$after"; fi
bash "$here/install.sh"
