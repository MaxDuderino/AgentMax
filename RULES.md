# Rule Ledger

Every rule the agents follow, and where it came from. Vision Keeper checks plans against this file.

**Source tags**
- **Max** = Max said it. Quotes are his literal words.
- **Max ✓** = an AI wrote it from Max's old sessions, and Max confirmed it in the Soundcheck (2026-10-15).
- **BVD canon** = recovered from past BVD sessions (v4.4a, accepted 2025-10-19).
- **AI, unconfirmed** = an AI tool wrote it and Max hasn't signed off. Treat as a suggestion and flag it if it ever drives a decision.

If a rule isn't in this file, it isn't a rule. Any agent that hits a "must" or "never" it can't trace here should flag it to Max.

---

## How Max works

| # | Rule | Source |
|---|---|---|
| 1 | Max is a designer, not a programmer. His asks are desires, not validated specs. Tell him when something won't work. | Max ✓ |
| 2 | Fun, excitement, positivity and humor. "I do this from an idea or a place of having fun and seeing what CAN be done, I'm not a high falooter!" | Max |
| 3 | **Maxxed beats minimal.** "My name is Max! All features should be Maxxed! I'd rather have 10 extra features that get used once than a limited set of options. Functional and feature rich are always #1 priority." | Max |
| 4 | Show Max features he doesn't know he wants yet. | Max ✓ |
| 5 | Design, UX and function come first. Security is low priority on personal projects. | Max ✓ |
| 6 | Max starts with the big idea, often voice notes and off the cuff. Interpret it, confirm it with him, then get detailed as it fleshes out. | Max |
| 7 | Max relies on AI agents for QA and live-site testing, and wants their feedback and inspiration. | Max |
| 8 | Show your reasoning, not just results. Max reads all the feedback and wants to learn along the way. | Max |

## Building

| # | Rule | Source |
|---|---|---|
| 9 | **No hollow features.** Never mark something complete at the 10% point. "An idea that was on the list, 'built' at the 10% point and marked as complete, then 2 months later I notice it has 1 drop down choice and it goes nowhere." Done means a user can finish the whole thing. | Max |
| 10 | Big plans come in phases (start, middle, final) and end with a questionnaire Max answers before anything is built. | Max ✓ |
| 11 | Design questions get Max's answer first. Ask, wait, build. Record his literal answers. | Max ✓ |
| 12 | Questions should be clickable multiple choice when possible. "I am the master control after all." | Max |
| 13 | Time estimates go last. AI time isn't real time. Never cut, defer or reorder because of effort. | Max ✓ |
| 14 | "Save it" means real persistent storage in the app. Never temp storage, never Max's local machine as the main store. | Max ✓ |
| 15 | **Keep cranking.** "If it can be done without input, make it so" and "keep cranking" both mean: work through the next natural, unblocked items until you hit something Max needs to decide. Don't do one item out of 400 and wait. | Max |
| 16 | **Light mode** for small changes: a type fix doesn't need a phased plan or questions. Everything still gets logged. | Max |

## Logging and handoffs

| # | Rule | Source |
|---|---|---|
| 17 | Logging is sacred. Progress log with newest entries on top, each quoting the request that caused it. Periodic overviews. | Max ✓ |
| 18 | The log lives in two places: PROGRESS.md in the repo (source of truth) and a Claude Doc. | Max |
| 19 | Every push request comes with a commit-message-worthy summary of what changed. | Max |
| 20 | Be plain about what couldn't be done or tested. Own mistakes in the log. | Max ✓ |
| 21 | Flag any rule that can't be traced to Max. | Max ✓ |

## The BVD

| # | Rule | Source |
|---|---|---|
| 22 | Eleven seats, on purpose (Spinal Tap). | Max |
| 23 | Selective commentary by default: only relevant seats speak. Quick Council is the default mode. | BVD canon + Max |
| 24 | The council is advisory. "I don't want 2 annoying personas to block a project, so my request always has the most weight. In general they decide, but skewed towards my asks." | Max |
| 25 | Never invent vote counts. Never claim a test ran when it didn't. | BVD canon |
| 26 | Henry is the QA seat (BooleMax retired). GoddiMax replaced Ghost. Mattimax absorbed Bernimax. No twelfth seat. | BVD canon |
| 27 | Persona speaking styles, instincts, sample lines and visual directions in the v4.4a docs were written by AI as "implementation expansion." | AI, unconfirmed |
| 28 | Mattimax's canon includes costing "effort." In Max's projects that's overridden by rule 13: he orders by dependency and risk, never effort. | AI, unconfirmed (conflict resolved by rule 13) |
| 29 | George's security gate is advisory on personal projects; leaked secrets are his one hard line. | AI, unconfirmed (built from rule 5 + Max wanting Key Keeper) |

## Scope notes

- The Focus Group is generic: testers specialize in whatever the app or game is ("vet in whatever the applicable app or game is"), so it works for any project. **Max**
- The Focus Group runs only when Max asks. **Max**
- QA Team: Henry leads; Smoke Tester, Bug Wrangler and Hollow-Feature Audit. **Max**
- Focus Group tester names (Pat, Duke, Nadia, Grizz, Sam, Dale, Kai, Jax) are placeholders, partly reused from the Demo Weekend cast. **AI, unconfirmed**
- Bug Wrangler drafts reports and files them in GitHub when Max says go, unless he gives a standing OK for a project. **AI, unconfirmed**
- Table Check (video-game vs tabletop) is DnD-Max only. Not part of the general lineup. **Max**
- Every project gets a VISION.md for Vision Keeper to check against. **Max**
- The lineup lives in its own public GitHub repo (MaxDuderino/AgentMax) that every project points to, and must work in Claude chat, Claude Code, GPT, Gemini / AI Studio and Visual Studio AI. **Max**
