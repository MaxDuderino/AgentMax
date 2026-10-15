# Agent Lineup

Max's crew of AI agents. Plain markdown, so any AI can read it. Start with README.md; this is the full sheet.

**House rules:** RULES.md (a copy ships inside every skill). **Log:** PROGRESS.md, newest on top.

## Status board

Honest by rule: an agent is only ✅ once it has done a real job.

| Status | Means |
|---|---|
| ✅ Proven | Did a real job; date and PROGRESS.md entry given |
| 🧪 Tested | Worked on test repos or samples, not yet on a real project |
| 🔍 Built, not run | Written, never run |

| Agent | Job | Called by | Status |
|---|---|---|---|
| **Session Kickoff** | Where we are, next moves, calls the crew | Max, at session start | ✅ Proven 2026-10-15 (kicked off the v1.0 shakedown on AgentMax) |
| **Wrap** | Key Keeper + Translator + Scribe + commit note, one readout | End of every change | ✅ Proven 2026-10-15 (wrapped the BVD-review fixes) |
| **BVD** | 11-persona review council | Kickoff for big plans, or Max | ✅ Proven 2026-10-15 (Full Council lineup review) · personas v4.5 approved |
| **Vision Keeper** | Writes VISION.md; checks plans; hunts untraced rules | Kickoff, phase boundaries | ✅ Proven 2026-10-15 (wrote AgentMax's VISION.md, flagged 2 untraced rules) |
| **Checkpoint** | Restore point, one-step rollback, cleanup | Kickoff, before risky moves | ✅ Proven 2026-10-15 (checkpoint + cleanup on AgentMax; rollback rehearsed with a merge commit) |
| **Key Keeper** | Secret scanner + commit hook + GitHub push protection | The Wrap, project setup | ✅ Proven 2026-10-15 (hook guards AgentMax's real commits; push protection on) |
| **QA Team** | Henry + Smoke Tester, Bug Wrangler, Hollow-Feature Audit | After deploys, "is it done?" | ✅ Proven 2026-10-15 (DnD-Max live play-through) |
| **Focus Group** | 9 generic testers for any app or game | Only when Max asks | ✅ Proven 2026-10-15 (Quick Playtest of AgentMax's install) · live-app run pending |
| **Deploy Doctor** | Vercel logs → diagnosis → proposed fix | A deploy breaks | 🔍 Built, not run · on Max's shakedown list |
| **Asset Forge** | Style bible, prompts, clickable copy queue | Art requests | 🧪 Tested (example queue) · real run on Max's shakedown list |
| **Translator** | Plain-English change report | Inside the Wrap; on request | ✅ Proven 2026-10-15 (inside the Wrap) |
| **Scribe** | Log entries, status overview, commit notes | Inside the Wrap; on request | ✅ Proven 2026-10-15 (inside the Wrap) |
| **Handoff Packer** | Cross-tool HANDOFF.md | Only when Max asks | ✅ Proven 2026-10-15 (AgentMax HANDOFF.md) |

**Not agents:** the Rule Ledger is RULES.md itself, and Vision Keeper enforces it. ~~Table Check~~ lives in DnD-Max only.

## The rhythm (less ceremony)

1. **Start:** Session Kickoff. It tags each next move with the crew it needs (Checkpoint first for risky moves, the BVD for big plans, QA after deploys) and runs them as part of the move.
2. **Build.** "Keep cranking" = keep going through unblocked items until something needs Max.
3. **End:** the Wrap. One readout: 🔑 secrets, 📝 what changed, 📒 logged, 📦 commit note.

**Small change? Light mode:** a one-line Wrap, nothing else.

## The BVD

Folder `bvd/`: conductor in `bvd/SKILL.md`, one file per seat in `bvd/personas/`.

| # | Seat | Lens |
|---|---|---|
| 01 | Max Bullis | Vision, the Maxxed version |
| 02 | Mattimax | Execution, sequencing |
| 03 | GoddiMax | Ethics, real people |
| 04 | Matthew | Accessibility (real weight) |
| 05 | Henry | QA, evidence, hollow features |
| 06 | Petrus | Safety, rollback |
| 07 | Richie | Fun, payoff |
| 08 | Randy | Prototype it now |
| 09 | Robert | Visual design, puns |
| 10 | George | Security, leaked secrets |
| 11 | Jerry | Follow-through, logs |

**Quick Council** (default): relevant seats only. **Full Council:** all eleven as separate subagents in Claude Code. Past councils are in `council/`.

## The Focus Group

Folder `focus-group/`. Generic for any app or game: `{THING}` and `{HOST}` are filled in per project.

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
| Lee | The Screen Reader User |

## Using it in each tool

**Claude chat:** upload each zip in `dist/` as a skill once. Talk normally ("catch me up", "wrap it") or type the slash name.

**Claude Code:** run `install.ps1` or `install.sh` once. Every skill goes to your personal skills, and all 23 subagents (11 BVD seats, 9 testers, 3 QA roles) go to your personal agents. Then paste `snippets/CLAUDE-AGENTS.md` into each project's CLAUDE.md.

**ChatGPT, Gemini, AI Studio:** upload `dist/for-gpt-gemini/AGENTMAX-ALL.md` (the whole lineup in one file) as a knowledge file, and paste `dist/for-gpt-gemini/INSTRUCTIONS.txt` into the instructions box. In a ChatGPT project or custom GPT, or a Gemini Gem, it stays loaded for every chat.

**Visual Studio and other coding tools:** put `snippets/AGENTS.md` in the project as AGENTS.md, and add AGENTMAX-ALL.md to the project or attach it.

## Changing the lineup

Edit the sources: `RULES.md`, the `SKILL.md` files, `tools/personas_v45_additions.json` (BVD), `focus-group/testers.json`, or `qa-team/roles/`. Then run `python tools/build.py`. It regenerates personas, subagents, the rule copies, the GPT/Gemini kit and the zips, with the same bytes every time. `python tools/build.py --check` tells you if anything is out of date.
