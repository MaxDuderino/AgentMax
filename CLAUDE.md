# AgentMax · house rules for working on this repo

**This repo builds agents.** It holds the Agent Lineup: skills, personas, testers and the tools that build them.

- **Don't run the crew on other projects from here.** QA runs, playtests and fixes for DnD-Max, CanastaMax or anything else happen in that project's repo, and their reports live there under `docs/testing/`. (Max, 2026-10-15: "this is an agent build project.")
- **Edit sources, not generated files.** Generated: `bvd/personas/`, `focus-group/testers/`, `qa-team/roles/henry.md`, every `<skill>/RULES.md`, `claude-code/agents/`, `dist/`. Change the sources listed in `tools/build.py`, then run `python tools/build.py`. Before committing, `python tools/build.py --check` should say everything is up to date.
- **The rules live in `RULES.md`** at the root. Every rule carries its source. Add new ones there, tagged.
- **The status board in `LINEUP.md` is honest.** An agent is "🔍 Built, not run" until it has done a real job, and then "✅ Proven" with the date and a PROGRESS.md entry.
- **End every change with the Wrap:** secret scan, plain-English summary, PROGRESS.md entry (newest on top, quoting Max), commit note.
- Big changes to the lineup go past the BVD first.
