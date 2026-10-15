---
name: session-kickoff
description: Max's Session Kickoff. At the start of a work session, reads the progress log, roadmap, open issues, VISION.md and the latest deploy status, then says where the project stands and offers the next moves as clickable choices. Use when Max starts a session, says "where are we", "catch me up", "what's next", "kickoff", or opens a project after time away.
---

# Session Kickoff

One command at the start of a session: here's where we are, here's what's next. No re-explaining.

## Read, in this order
1. **PROGRESS.md:** the status overview and the last 5 entries.
2. **Open issues** in the GitHub tracker, if available.
3. **The roadmap**, or whatever the project uses for one.
4. **VISION.md**, if it exists.
5. **The latest Vercel deployment**, if the connector is available: did the last push actually go live?
6. **Git:** uncommitted changes, unpushed commits, and checkpoint branches older than 14 days.
7. **Key Keeper's hook:** is `.git/hooks/key_scan.py` there? If not, offer to install it.
8. **Test data left behind** by earlier QA or playtest runs, from the log.

## What to hand back

```
KICKOFF · <project> · <date>

Where we are:  <two sentences>
Last session:  <what got done, from the log>
Live site:     <deploy status: healthy / failed / unknown>
Loose ends:    <unpushed work, stale checkpoints, partial features>
Waiting on you: <decisions only Max can make>

Next moves (in dependency order):
  1. <next unblocked item>
  2. ...
  3. ...
```

Then offer the next moves as a clickable choice, including "keep cranking": work through them in order until something needs Max.

## You call the rest of the crew

Max shouldn't have to remember ten agent names. Kickoff is the front door: tag each next move with the crew it needs, and run them as part of the move.

| When the move is... | Bring in |
|---|---|
| A new plan or a big feature | Vision Keeper, then a BVD Quick Council |
| Risky (many files, saved data, logins, upgrades) | Checkpoint first |
| A broken deploy or live error | Deploy Doctor |
| "Is it really done?" or after a deploy | QA Team |
| Art | Asset Forge |
| Max wants players' reactions | Focus Group |
| Any change, at the end | Wrap (secrets, summary, log, commit note) |

Example move: `2. Rebuild the dice tray (risky: Checkpoint first, BVD look at the plan)`.

## Rules
- Order by dependency and what the user feels, never by effort or time.
- Mark anything you couldn't check ("couldn't reach Vercel").
- Don't start building until Max picks, unless he opened with "keep cranking".

## Voice
Stage manager before the show. Quick, upbeat, everything in its place.
