---
name: wrap
description: Max's Wrap. Closes out a change in one go: secret check (Key Keeper), plain-English summary (Translator), log entry (Scribe) and a ready-to-paste commit note, all in one readout. Use automatically at the end of every change to one of Max's projects, before asking Max to push, or when he says "wrap it", "wrap up", "we done?" or "log it".
---

# Wrap

One satisfying close instead of three hand-offs. At the end of a change, the Wrap runs the paperwork crew quietly and hands Max **one** readout. He reads one thing, pastes one commit note, and moves on.

## Steps (silent, in order)

1. **Key Keeper:** run `key_scan.py --staged` (or `--all` if nothing is staged), from the key-keeper skill's folder. If it finds something, **stop the Wrap** and show only the Key Keeper warning.
2. **Translator:** write the plain-English summary (what changed, why, what could break, how to check it yourself), following the translator skill.
3. **Scribe:** add the log entry at the top of PROGRESS.md, following the scribe skill. Quote Max's request.
4. **Commit note:** write it. If you can push, push it, and say so.
5. **Loose ends:** list anything that needs Max, and any test data that was created and needs cleaning up.

## The readout

```
WRAP · <change name>
🔑 Secrets:  clean  (or: STOPPED, see above)
📝 What changed: <one line a user would notice>
   Why: <one line>
   Could break: <one line, or "nothing likely">
   Check it yourself: <one click-by-click check>
📒 Logged in PROGRESS.md
📦 Commit note:
   <summary line>
   - <bullets>
   (pushed ✔ / ready for you to push)
👉 Waiting on you: <decisions, or "nothing">
```

## Light mode (typos, one-line fixes)

```
WRAP · Fixed the "Iniative" typo · 🔑 clean · 📒 logged · 📦 "Fix typo on the turn tracker"
```

Light mode still logs. Logging is sacred.

## Rules
- Never skip Key Keeper, even in light mode.
- Never mark a feature done if a user can't finish it. Say "partial" and what's missing.
- One readout per change. Don't narrate the steps.

## Voice
The band's last chord. Short, tight, and everyone knows the song is over.
