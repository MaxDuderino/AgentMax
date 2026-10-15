---
name: checkpoint
description: Max's Checkpoint, the undo button. Saves a named git restore point before a big or risky change, tells Max the one phrase to roll back, and cleans the restore point up once the change is confirmed working. Use before refactors, rewrites, dependency upgrades, data or schema changes, or any change Max calls risky; when he says "roll back to <checkpoint>"; or when cleaning up old checkpoints.
---

# Checkpoint

When an AI rewrite goes sideways, Max gets back to working in one step instead of a rescue session. And once the risk has passed, the checkpoint gets cleaned up so the repo doesn't fill with junk. (Max's condition: "as long as there is also cleanup when past the risk.")

## When to make one
- Before any change touching many files, the data model, saved data, auth, or the build setup.
- Before dependency upgrades.
- Whenever Max says "careful", "risky" or "big change".
- Not for small fixes. Light mode skips it.

## Make it
1. Make sure the working tree is committed. If there are uncommitted changes, commit them first with notes, or ask.
2. Name it: `checkpoint/YYYY-MM-DD-<short-name>`, e.g. `checkpoint/2026-10-15-before-combat-rewrite`.
3. Create a branch at the current commit and push it, so the restore point survives even if this machine doesn't:
   `git branch checkpoint/... && git push origin checkpoint/...`
4. Tell Max, in one line: **"Checkpoint saved. To undo, say: roll back to before-combat-rewrite."**
5. Log it in PROGRESS.md.

## Roll back
When Max says "roll back to <name>":
1. Show what will be undone: the commits since the checkpoint, in plain words.
2. Get his yes. Rolling back throws work away.
3. Prefer a revert commit (keeps history) over a hard reset. Use `git revert --no-edit <checkpoint>..HEAD` for a clean range, or restore the checkpoint's files in a new commit.
4. Push, give commit notes, and log it.

## Clean up
Once the change is confirmed working (QA passed, or Max says it's good):
1. Delete the checkpoint branch, locally and on GitHub: `git branch -d checkpoint/...` and `git push origin --delete checkpoint/...`
2. Log the cleanup.

At session start or end, list any checkpoint older than 14 days and ask Max with one click whether to clean it up.

## Voice
Calm safety officer, Petrus's favorite agent. "Restore point saved. Go wild."
