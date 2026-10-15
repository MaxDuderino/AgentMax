# AgentMax · The Agent Lineup

Max's AI crew: an 11-persona review council, a playtest crew, a QA team and a road crew of helpers. They're written as plain instructions, so Claude, ChatGPT, Gemini and the rest can all use them.

## Say this to start

> **"Catch me up."**

That's Session Kickoff. It reads where the project stands, offers the next moves as clickable choices, and brings in the rest of the crew when a move needs them. At the end of every change, the **Wrap** checks for leaked keys, explains the change in plain English, logs it, and hands you a commit note. Those two are the only ones you need to remember.

## The band

| Who | Job | Say |
|---|---|---|
| **Session Kickoff** | Where we are, what's next | "catch me up" |
| **Wrap** | Secrets check, summary, log, commit note | "wrap it" |
| **The BVD** | 11-seat review council | "run it past the BVD" |
| **Vision Keeper** | Keeps plans on your vision, hunts AI-invented rules | "is this still what I wanted?" |
| **Checkpoint** | Undo button before risky work | "checkpoint this" / "roll back to..." |
| **Key Keeper** | No leaked API keys, ever | (the Wrap runs it) |
| **QA Team** | Henry's crew: smoke test, bugs, hollow features, keyboard pass | "QA the site" |
| **Focus Group** | 9 testers from Noob to Screen Reader User | "playtest this" |
| **Deploy Doctor** | Broken Vercel deploys, diagnosed | "the deploy broke" |
| **Asset Forge** | Art prompts, one-click copy queue for ChatGPT | "I need art for..." |
| **Translator / Scribe** | Plain English, the log (inside the Wrap) | "explain that" / "log it" |
| **Handoff Packer** | A brief to take to another tool | "pack it up" |

The full sheet, with what's proven and what isn't yet, is in **LINEUP.md**. The house rules, each with its source, are in **RULES.md**.

## Install

Step by step, for every tool: **INSTALL.md**. Every command on one page: **COMMANDS.md**. To update later: `update.ps1` (Windows) or `update.sh`. New project? Start from the **MaxTemplateWithAgents** template.

### The short version

- **Claude chat:** upload each zip in `dist/` as a skill, once. They then work in every chat.
- **Claude Code:** run `install.ps1` (Windows) or `install.sh` (Mac/Linux) from this folder. That installs every skill and all 23 subagents for every repo. Then paste `snippets/CLAUDE-AGENTS.md` into each project's CLAUDE.md.
- **ChatGPT, Gemini, AI Studio and the rest:** upload `dist/for-gpt-gemini/AGENTMAX-ALL.md` as a knowledge file, and paste `dist/for-gpt-gemini/INSTRUCTIONS.txt` into the instructions box. For coding tools that read AGENTS.md, use `snippets/AGENTS.md`.
