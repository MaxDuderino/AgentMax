# Agent Lineup

Max's crew of AI agents. Plain markdown, so any AI can read it: Claude, Claude Code, GPT, Gemini, Visual Studio. Start here.

**House rules:** RULES.md. Every agent follows them.
**Progress log:** PROGRESS.md, newest on top.

## Status board

| Agent | Job | Call it when | Status |
|---|---|---|---|
| **BVD** | 11-persona review council | Running a plan, design or change past the team | ✅ Built (v4.5-draft) |
| **Focus Group** | 8 generic testers play any app or game | Only when Max asks for a playtest | ✅ Built |
| **QA Team** | Henry + Smoke Tester, Bug Wrangler, Hollow-Feature Audit | After a deploy, something broke, or "is it really done?" | ✅ Built |
| **Scribe** | Progress log, overviews, commit notes | Every change. Always on | ✅ Built |
| **Vision Keeper** | Writes VISION.md with Max; checks plans against it and RULES.md; hunts AI-invented rules | Phase boundaries and new plans | ✅ Built |
| **Asset Forge** | Style bible, batch prompts, clickable copy-paste queue for ChatGPT | Making game or app art | ✅ Built |
| **Deploy Doctor** | Reads Vercel logs, diagnoses, proposes the fix (never acts alone) | A deploy breaks | ✅ Built |
| **Checkpoint** | Restore point before risky work, one-phrase rollback, cleanup after | Before big or risky changes | ✅ Built |
| **Translator** | Plain-English "what changed, why, what might break" | After a change | ✅ Built |
| **Session Kickoff** | Reads log, roadmap, issues, deploy; where we are + next moves | Start of a session | ✅ Built |
| **Rule Ledger** | RULES.md, every rule with its source; Vision Keeper enforces it | Any new rule | ✅ Built |
| **Key Keeper** | Secret scanner + automatic pre-commit check | Before every commit and push | ✅ Built |
| **Handoff Packer** | Writes a cross-tool HANDOFF.md | Only when Max asks | ✅ Built (on demand) |
| ~~Table Check~~ | Video-game vs tabletop | DnD-Max only, lives in that repo | ✂️ Not in this lineup |

## The BVD

Folder: `bvd/`. Conductor instructions in `bvd/SKILL.md`, one file per seat in `bvd/personas/`.

| # | Seat | Lens |
|---|---|---|
| 01 | Max Bullis | Vision, the Maxxed version |
| 02 | Mattimax | Execution, sequencing |
| 03 | GoddiMax | Ethics, real people |
| 04 | Matthew | Accessibility |
| 05 | Henry | QA, evidence, hollow features |
| 06 | Petrus | Safety, rollback |
| 07 | Richie | Fun, payoff |
| 08 | Randy | Prototype it now |
| 09 | Robert | Visual design, puns |
| 10 | George | Security, leaked secrets |
| 11 | Jerry | Follow-through, logs |

Two modes: **Quick Council** (default, relevant seats only) and **Full Council** (all eleven; separate subagents in Claude Code).

## The Focus Group

Folder: `focus-group/`. Generic for any app or game: `{THING}` and `{HOST}` get filled in per project.

| Tester | Seat |
|---|---|
| Pat | The Noob |
| Duke | The First-Time {HOST} |
| Nadia | The PRO |
| Grizz | The Vet |
| Sam | The Person on the Street |
| Dale | The Dad Gamer |
| Kai | The Teen Gamer |
| Jax | The Pro Live Streamer |

Quick Playtest by default; Full Playtest runs all eight as separate subagents in Claude Code. Testers click the live site when a browser is available.

## The QA Team

Folder: `qa-team/`. Henry leads. Smoke Tester after deploys, Bug Wrangler for breakage, Hollow-Feature Audit for "done" items that aren't.

## Using it in each tool

**Claude chat (claude.ai):** upload the zips in `dist/` as skills once (one per agent). They're then available in every chat and project. Talk normally ("run it past the BVD", "catch me up", "QA the site") or type the slash name, like `/bvd` or `/session-kickoff`.

**Claude Code:** run the installer once (`install.ps1` on Windows, `install.sh` on Mac/Linux). It copies every skill to your personal skills and all 22 subagents (11 BVD seats, 8 testers, 3 QA roles) to your personal agents, so they work in every repo. Then each project's CLAUDE.md gets the snippet in `snippets/CLAUDE-AGENTS.md`.

**GPT, Gemini, AI Studio, Visual Studio:** they don't load Claude skills. Hand them `LINEUP.md`, `RULES.md`, `bvd/SKILL.md` and the persona files, or point an AGENTS.md at this repo with the same snippet.

## A normal session, with the whole crew

1. **Session Kickoff**: where we are, what's next.
2. **Vision Keeper** checks the plan. **BVD** reviews big decisions.
3. **Checkpoint** before anything risky. Build. **Key Keeper** before each commit.
4. **Translator** explains the change. **Scribe** logs it and writes commit notes.
5. After the deploy: **QA Team** smoke test. **Deploy Doctor** if it broke. **Checkpoint** cleanup once it's good.
6. **Focus Group** and **Asset Forge** whenever Max calls them.

## Adding or changing a persona

BVD: edit `tools/personas_v45_additions.json` (or the v4.4a source JSON for canon). Focus Group: edit `focus-group/testers.json`. QA: edit the files in `qa-team/roles/`. Then run `python tools/build.py`. It regenerates the persona files, the Claude Code wrappers and the skill zips in `dist/` so nothing drifts apart.
