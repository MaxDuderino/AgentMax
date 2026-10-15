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
3. Make sure nothing is half-done: commit or stash uncommitted changes first.
4. Restore the checkpoint's files in **one step and one new commit**. History is kept, so the rollback itself can be undone:
   ```
   git read-tree -u --reset checkpoint/<name>
   git commit -m "Roll back to checkpoint <name>"
   ```
   This handles merges and conflicts that a commit-by-commit `git revert` chokes on. Rehearsed 2026-10-15 on a repo with a merge commit: the revert failed, this restored the files exactly.
5. Check it: `git diff checkpoint/<name> HEAD` should show nothing.
6. **If anything goes wrong mid-way:** `git reset --hard HEAD` puts the working copy back to the last commit. Nothing is lost, because the checkpoint branch still exists.
7. Push, give commit notes, and log it.

## Clean up
Once the change is confirmed working (QA passed, or Max says it's good):
1. Delete the checkpoint branch, locally and on GitHub: `git branch -d checkpoint/...` and `git push origin --delete checkpoint/...`
   Some cloud sessions aren't allowed to delete branches on GitHub (found 2026-10-15). There, keep the checkpoint local-only (don't push it), or give Max the one-click delete: the repo's **Branches** page on GitHub, then the trash icon.
2. Log the cleanup.

At session start or end, list any checkpoint older than 14 days and ask Max with one click whether to clean it up.

## Voice
Calm safety officer, Petrus's favorite agent. "Restore point saved. Go wild."
