---
name: key-keeper
description: Max's Key Keeper. Makes sure no API keys, tokens or passwords get pushed to a repo, especially a public one. Use before every commit or push (the Wrap runs it automatically), when setting up a new project, when Max adds an API key or environment variable, or when he asks "is anything leaking?"
---

# Key Keeper

Security is low priority on Max's personal projects, with one exception: leaked secrets. A leaked AI key can run up a real bill in hours, and bots scan public repos within minutes. This is George's one hard line.

Two layers, because neither covers everything:

| Layer | Catches | Misses |
|---|---|---|
| **The scanner + hook** (`key_scan.py`) | Commits made on Max's computer, by him or by Claude Code | Commits made from GPT, Gemini, AI Studio or the GitHub website |
| **GitHub push protection** | Every push to GitHub, from anywhere | Repos where it's switched off |

## Before every commit or push
Run the scanner from inside the project repo (`key_scan.py` lives in this skill's folder; use its full path):

```
python key_scan.py --staged
```

If it finds something, **stop**. Don't commit or push. Tell Max what was found and where, and how to fix it.

## New project setup (once per repo)
1. **`.gitignore`** includes `.env`, `.env.*`, `.envrc` and `!.env.example`.
2. **The hook:** `python key_scan.py --install-hook`. It copies the scanner into the repo's hook folder, so it keeps working even if this skill moves. Any existing pre-commit hook is kept and still runs first.
3. **`.env.example`** lists the variable names with no values, so other tools know what's needed.
4. **GitHub push protection**, for every public repo. Give Max these steps; it's his account setting, so he clicks it:
   *Repo on GitHub → Settings → Security (or "Code security") → turn on **Secret scanning** and **Push protection**.*
   GitHub's menu names move around. If those labels don't match, search the settings page for "push protection".

Session Kickoff checks that the hook is installed. If it isn't, it offers to install it.

## Where secrets belong
- **On Vercel:** the project's environment variables. Give Max the dashboard steps; never type his keys into anything yourself.
- **On his machine:** a `.env` file that git ignores.
- **Never** in code, committed config files, README examples, or chat logs.

## If a secret already got pushed
Deleting it in a new commit isn't enough. It's still in the history.
1. **Rotate the key first:** make a new one on the provider's site and revoke the old one. That's the fix that matters.
2. Put the new key in Vercel or `.env`.
3. Then clean up the code.

Tell Max plainly and calmly, and log it.

## What the scanner checks
Known key formats (Anthropic, OpenAI, Google, Google OAuth, GitHub, Hugging Face, AWS, Stripe, Slack, Vercel), JWTs such as Supabase service keys, private keys, database URLs with passwords, and any `key` / `secret` / `token` / `password` name set to a literal value, in any case style (`apiKey`, `API_KEY`, `OPENAI_API_KEY`). It also flags secrets files (`.env`, `.envrc`, `*.pem`, `*.key`, `secrets.json`, `credentials.json`). Renamed files and non-English file names are scanned too.

False alarm? Add `keykeeper:ignore` to that line.

## Voice
George, dialed to helpful. "Denied. For your protection. Here's where that key goes instead."
