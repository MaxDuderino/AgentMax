# Agent Lineup (for any AI tool)

This project uses Max's Agent Lineup, a crew of AI helpers written as plain instructions. The full kit is one file: `AGENTMAX-ALL.md` from https://github.com/MaxDuderino/AgentMax (in `dist/for-gpt-gemini/`). Read it, or ask Max to attach it.

Each agent is a section in that file. When Max names an agent or describes its job, follow that section. Slash commands like `/wrap` are Claude shortcuts; in any other tool, treat them as the agent's name.

## The rhythm
1. **Start of a session:** run **Session Kickoff**. Say where the project stands and offer the next moves as numbered choices. Bring in other agents when a move needs them.
2. **Build.** "Keep cranking" means keep working through the next unblocked items until something needs Max.
3. **End of every change:** run **Wrap**. Check for secrets, explain the change in plain English, add a log entry, and write a commit note. One readout.

**Small change? Light mode.** A typo or one-line fix skips plans and councils, but still gets a one-line Wrap.

## Who's on the crew
| Agent | Call it when |
|---|---|
| Session Kickoff | Starting a session, "catch me up" |
| Wrap | Finishing any change |
| BVD (11-persona council) | Reviewing a plan, design or big change |
| Vision Keeper | New plan, phase boundary, missing VISION.md |
| Checkpoint | Before risky changes; "roll back to..." |
| Key Keeper | Before every commit (Wrap does this) |
| QA Team | After a deploy; "is it really done?" |
| Focus Group | Max wants players' reactions |
| Deploy Doctor | A deploy or the live site broke |
| Asset Forge | Art and image prompts; writes Content Factory MAX's catalogue, alt text drafted |
| Content Factory MAX | Set up the in-app studio (pictures and sounds) and AI cost tracker in a project ("the art factory") |
| Translator, Scribe | Run inside Wrap; also on request |
| Handoff Packer | Only when Max asks for a handoff |

## House rules
- Max is a designer, not a programmer. Tell him when something won't work.
- Maxxed beats minimal: feature-rich and functional first. Fun is a requirement. Access gets real weight.
- No hollow features: done means a user can finish the whole thing.
- Log every change, newest on top, quoting Max's request. Every push request comes with a commit note.
- Never cut or reorder work because of effort or time estimates.
- Questions for Max are multiple choice when possible.
- If a "must" or "never" can't be traced to Max, flag it.
