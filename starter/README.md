# New Max Project

_Started from **MaxTemplateWithAgents**: the Agent Lineup structure is built in. Rename this heading, then replace this section with what the project is._

## First five minutes
1. **Say "catch me up"** in Claude (chat or Code). Session Kickoff sees a fresh project and gets the crew going.
2. **Vision Keeper writes VISION.md with you:** a few clickable questions about what this is, who it's for, and the Maxxed feature list.
3. **Turn on the secret-scan hook:** Kickoff offers to do it, or run this once in the project folder:
   - Windows: `python "%USERPROFILE%\.claude\skills\key-keeper\key_scan.py" --install-hook`
   - Mac/Linux: `python3 ~/.claude/skills/key-keeper/key_scan.py --install-hook`
4. **On GitHub:** Settings → Security (or "Code security") → turn on **Secret Protection** and **Push protection**.
5. **Build.** Say "keep cranking" to keep going, and "wrap it" at the end of every change.

## What's in here

| File | What it's for |
|---|---|
| `CLAUDE.md` | House rules and the crew rhythm, for Claude Code |
| `AGENTS.md` | The same, for ChatGPT, Gemini, Visual Studio and other tools |
| `VISION.md` | What this project is and what "done" means. Vision Keeper fills it in |
| `PROGRESS.md` | The log: newest on top, quoting the request behind each change |
| `docs/testing/` | QA and playtest reports for this project live here |
| `.gitignore` | Keeps `.env` and other secrets out of git |
| `.env.example` | Names of the secrets this project needs, never the values |
| `kits/content-factory-max/` | The **Content Factory MAX kit**: in-app AI studio for pictures and sounds, AI usage & cost tracker, Make art buttons. Not wired in yet: say "set up the content factory" (or "the art factory") once the app exists and the `content-factory-max` skill installs it |

The crew itself (BVD, QA Team, Focus Group and the rest) is installed once on your machine from **AgentMax**, so every project always gets the latest version. Nothing here goes stale.
