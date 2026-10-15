# Progress Log

Newest on top. Each entry quotes the request that caused it.

---

## 2026-10-15 · Focus Group and QA Team built, pushed to AgentMax

> "they need to be a bit more generic so lets expand it, to test any app or game so "vet" in whatever the applicable app or game is a better specialty. something like: noob, first time %whatever%, PRO %whatever%, Vet %Whatever, Person on the street, Dad Gamer, teenager gamer, and pro live streamer."

**What changed**
- **Focus Group:** 8 generic testers (Pat the Noob, Duke the First-Time {HOST}, Nadia the PRO, Grizz the Vet, Sam the Person on the Street, Dale the Dad Gamer, Kai the Teen Gamer, Jax the Pro Live Streamer). `{THING}` and `{HOST}` get filled in per project, so the same crew tests DnD-Max, CanastaMax or MasterDebater. Quick and Full Playtest modes. Runs only when Max asks.
- **QA Team:** Henry leads a Smoke Tester, a Bug Wrangler and a Hollow-Feature Audit. Evidence-or-it-didn't-happen rules, live-site clicking, a deploy check through Vercel first, and grades of Full / Partial / Hollow / Missing for "done" items.
- 11 new Claude Code subagents (8 `fg-*`, 3 `qa-*`). Henry's persona now also ships inside the QA Team skill.
- Installers now set up all three skills and all 22 subagents.
- Repo moved from the working name "agent-lineup" to MaxDuderino/AgentMax.

**Not done / not tested**
- No playtest or QA run has happened yet. First real run is the test.
- Tester names are placeholders (RULES.md).

---

## 2026-10-15 · BVD v4.5-draft built, lineup repo scaffolded

> "ok filled out and here are some BVD docs from their long running history lol."

**What changed**
- Built the BVD from the recovered v4.4a canon (11 members, accepted 2025-10-19) plus Max's Soundcheck answers.
- `bvd/personas/`: eleven portable persona files. Each has canon, how they talk, how they steer, how they disagree, what they flag, and a new "In Max's projects" section.
- `bvd/SKILL.md`: the conductor. Quick Council by default, Full Council on request. Council is advisory and skewed toward Max's asks. Ends every review with a BVD readout and clickable decisions.
- `claude-code/agents/`: eleven `bvd-*` subagents for real Full Councils in Claude Code.
- `RULES.md`: rule ledger, every rule tagged with its source. Max's literal Soundcheck answers quoted.
- `LINEUP.md`: master sheet and status board.
- `tools/build.py`: regenerates personas and wrappers from the source JSON so they stay in sync.
- Install scripts for Windows and Mac/Linux.

**Decisions from the Soundcheck**
- Top three to build: BVD, a 5-person demo weekend crew, the QA team.
- Build now: Scribe, Vision Keeper, Focus Group, Asset Forge, Deploy Doctor (propose fixes, don't act).
- Wanted bonus agents: Checkpoint (with cleanup), Translator, Bug Wrangler, Key Keeper, Smoke Tester, Session Kickoff, Rule Ledger. Handoff Packer is a maybe, on demand only.
- Table Check cut from this lineup; it stays a DnD-Max-only agent.

**Not done / not tested**
- The Full Council subagents haven't been run in Claude Code yet. First real council will be the test.
- Persona v4.5 changes are drafts until Max approves them. Persona speaking styles and sample lines were AI-written in v4.4a and are still unconfirmed (RULES.md #27).

---

## 2026-10-15 · Agent Lineup Soundcheck

> "can you review and build a clickable questionaire style form to guide this process along?"

- Built the Soundcheck questionnaire artifact. Max rated the handoff brief, my read on how he works, and every proposed agent. Answers saved in the artifact.
