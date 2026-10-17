# Installing the Agent Lineup

Written for Grizz: one step at a time, nothing skipped. Pick the tools you use; you don't need all of them.

---

## Step 0: Get the files (everyone)

AgentMax is a **private** repo, so you download it while signed in to GitHub.

**Easiest (recommended):** GitHub Desktop
1. Install **GitHub Desktop** from desktop.github.com and sign in.
2. **File → Clone repository** → pick **MaxDuderino/AgentMax** → choose a folder, e.g. `Documents\AgentMax` → **Clone**.

This way, updating later is one command (see **Updating** below).

**Quick:** download a ZIP
1. Open github.com/MaxDuderino/AgentMax while signed in.
2. Green **Code** button → **Download ZIP** → unzip it to `Documents\AgentMax`.

A ZIP download can't update itself. To update, download it again.

---

## Claude chat (claude.ai, the desktop app, mobile)

1. **Turn on code execution:** Settings → Capabilities → turn on **Code execution and file creation**. Skills need it.
2. **Upload the skills:** go to **Customize → Skills** → **+** → **Create skill** → **Upload a skill**.
   - Pick a zip from the `dist` folder.
   - **Repeat for each zip.** One zip holds one skill, and there are 14. Start with `session-kickoff.zip` and `wrap.zip` if you're short on time.
3. **Test it:** open a new chat and say **"catch me up"**.

_These menu names come from Claude's help center ("Use skills in Claude"). If Claude moves them, search its help center for "upload a skill"._

---

## Claude Code (Windows)

1. Open the AgentMax folder in File Explorer.
2. Right-click **install.ps1** → **Run with PowerShell**.
   - If Windows blocks it, open PowerShell in that folder and run:
     `powershell -ExecutionPolicy Bypass -File install.ps1`
3. **Restart Claude Code.**
4. **Test it:** in any project, type **/session-kickoff**.
5. **For each project:** paste `snippets/CLAUDE-AGENTS.md` into the project's CLAUDE.md. New projects started from **MaxTemplateWithAgents** already have it.

## Claude Code (Mac or Linux)

In a terminal in the AgentMax folder: `bash install.sh`. Then restart Claude Code.

---

## ChatGPT

1. Make a **Project** (or a **custom GPT**).
2. Upload `dist/for-gpt-gemini/AGENTMAX-ALL.md` as a file.
3. Paste the contents of `dist/for-gpt-gemini/INSTRUCTIONS.txt` into the instructions box.
4. **Test it:** "catch me up".

## Gemini (a Gem) or AI Studio

1. Make a new **Gem**.
2. Paste `INSTRUCTIONS.txt` into its instructions, and add `AGENTMAX-ALL.md` as a knowledge file.
3. **Test it:** "catch me up".

## Visual Studio and other coding tools

Copy `snippets/AGENTS.md` into the project as **AGENTS.md**, and attach `AGENTMAX-ALL.md` to the chat.

---

## Updating

**Claude Code (Windows):** right-click **update.ps1** → **Run with PowerShell**. It pulls the latest from GitHub and reinstalls.
**Mac/Linux:** `bash update.sh`

If you used the ZIP download, download a fresh ZIP and run the installer again instead.

**Claude chat, ChatGPT, Gemini:** re-upload whatever changed. PROGRESS.md says which agents changed in each update.

## Removing it

Delete the lineup's folders from `%USERPROFILE%\.claude\skills\` (Mac/Linux: `~/.claude/skills/`), and the `bvd-*`, `fg-*` and `qa-*` files from `.claude\agents\`.

## Stuck?

Say "the install didn't work" in any Claude chat, and paste what you saw.
