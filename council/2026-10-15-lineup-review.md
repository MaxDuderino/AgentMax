# BVD Full Council · Lineup Review · 2026-10-15

> "ok we are off track, this is an agent build project. so in that spirit, lets have the BVD review the agent files and overall process you just created and suggest improvements or their approval."

**Mode:** Full Council. All eleven seats ran as separate agents, each reading the repo cold. This was the BVD's first real run.
**Vote:** 11 of 11 **APPROVE WITH CHANGES**. No seat said rework, and no seat approved as-is.

## BVD READOUT

**Call:** Keep the lineup. Fix the foundation before adding anything new.
**Why:** The structure, personas and build pipeline hold up. Several seats re-ran the build on copies, and the personas and wrappers came out identical. But the board calls things done that have never run, the rules don't travel with the agents, and the "works in GPT and Gemini" promise is a 10%-built feature.

## What the council agreed on (seats in brackets)

| # | Finding | Fix proposed |
|---|---|---|
| 1 | **RULES.md doesn't ship with the agents.** It's not in any zip and not copied by the installers, so Vision Keeper and the BVD can't reach it in Claude chat or other repos. [Mattimax, Richie, Randy: blocker] | build.py copies RULES.md into every skill; installers copy it too |
| 2 | **The status board grades itself.** 12 agents show ✅, but only Key Keeper and now the BVD have actually run. [Henry, Mattimax, Jerry, Max, Richie] | "🔍 Built, not run" vs "✅ Proven (date)"; Rule Ledger is a file, not an agent |
| 3 | **The cross-tool path is hollow.** No AGENTS.md, and the snippet is all Claude slash commands. [Max, Mattimax, Henry, Randy, Robert, Richie] | `snippets/AGENTS.md` in plain words, plus one paste-in bundle (`dist/AGENTS-ALL.md`) for GPT, Gemini or a Gem |
| 4 | **DnD-Max drift.** The QA report and log entries sit in the agent repo; test table QXT-RZN is still live; the drift wasn't logged as a mistake. [all 11] | Move `reports/dnd-max/` to DnD-Max, add an AgentMax CLAUDE.md fence ("this repo builds agents"), and add a test-data cleanup rule |
| 5 | **Too much ceremony per change.** The session flow chains about 8 agents and 10 slash commands. [Max, Richie, Robert] | One "wrap" at the end of a change (Key Keeper + Translator + Scribe → one readout and commit note). Session Kickoff offers the rest. Light mode goes at the top. |
| 6 | **Key Keeper has holes.** Renamed files, `OPENAI_API_KEY = "…"` (SCREAMING_CASE), non-ASCII file names, JWTs, `GOCSPX-` and `hf_` keys, and `.envrc` all get through. The hook overwrites existing hooks and uses a fixed path. And hooks never see GPT, Gemini or web commits. [George: blocker; Henry, Petrus, Mattimax] | Fix the filters and patterns, back up existing hooks, add GitHub secret scanning + push protection to setup, and correct the "covers other AI tools" claim |
| 7 | **Checkpoint rollback can stop halfway** (one revert per commit). [Petrus] | Revert everything in one commit, add an abort escape, rehearse once |
| 8 | **Nothing checks access.** QA has no keyboard pass, Focus Group has no tester with an access need, RULES.md is silent. [Matthew] | Ask Max how much access counts; add an "Access:" line to QA reports either way |
| 9 | **Real people may be in a public repo.** The BVD source named a real co-founder, and Matthew's file says he's blind. [GoddiMax: blocker if they're real] | **Max:** "they are 2 different people and MattKoch should probably be referred to as MattiMax." Real name replaced with Mattimax everywhere. |
| 10 | **The build churns.** Zips change every run, there's no `--check` or `--help`, and the asset queue crashes without arguments. [Jerry, Henry, Randy] | Fixed zip timestamps, `--check` mode, usage messages |
| 11 | **The front door has no focal point.** The README is 339 bytes. [Robert] | README becomes the stage: the band in one table, a 2-minute install, "say this to start". One combined zip option. |
| 12 | **QA and Focus Group subagents inherit every tool.** [George] | Explicit `tools:` lines; no GitHub access for Bug Wrangler until Max says go |
| 13 | **Scribe skipped its own status overview.** [Jerry] | Add one at the top of PROGRESS.md with an owner on every loose end |

**Smaller notes:** asset queue buttons need asset names for screen readers, "Next up" shouldn't reset the filter, and it needs a reduced-motion guard (Robert, Matthew). Brand names mix metaphors (Robert).

## Flags (advisory: Max decides)
- **George:** Key Keeper holes. Leaked secrets are the one hard line.
- **Mattimax / Richie / Randy:** RULES.md not bundled.
- **GoddiMax:** real-person details in a public repo, if Matt and Matthew are real people.

## Confessions logged
- **The builder (Claude):** drifted from agent-building into QA on DnD-Max. Max called it out.
- **Jerry:** accidentally re-ran `tools/build.py` during review, which rewrote three zips with new timestamps. Reverted with `git checkout dist/`; the repo is clean.

## Unchecked by anyone
Windows `install.ps1`, uploading zips to Claude chat, any skill running in GPT or Gemini, GitHub push protection status, and whether QXT-RZN still exists.

## For Max
1. ~~Real people?~~ Answered: the co-founder is now called Mattimax everywhere
2. Which fixes to build, and in what order
3. How much does access count in your projects?
4. Where should DnD-Max QA reports live?
