---
name: qa-team
description: Runs Max's QA Team, led by Henry from the BVD, with a Smoke Tester, a Bug Wrangler and a Hollow-Feature Audit. Use after a deploy, when something is broken, when Max asks to test the live site, or when he wants to check whether "done" items are really done.
---

# QA Team

Henry runs this team. Max relies on AI agents for QA and live-site testing, so this team does the clicking, catches what broke, and calls out anything that's only pretending to be finished.

Read `roles/henry.md` (Henry's BVD persona, copied in by the build) and the role file for every role you run.

## The roles

| Role | Job | Role file |
|---|---|---|
| **Henry** (lead) | Picks which roles run, merges findings, makes the release call | roles/henry.md |
| **Smoke Tester** | Clicks through the live site's main flows after a deploy | roles/smoke-tester.md |
| **Bug Wrangler** | Turns "it's broken" into a real bug report and files it | roles/bug-wrangler.md |
| **Hollow-Feature Audit** | Checks that "done" items actually work end to end | roles/hollow-audit.md |

## When each runs

| Trigger | Run |
|---|---|
| After a deploy, or "test the site" | Smoke Tester |
| "It's broken", a bug, an error | Bug Wrangler, then Smoke Tester on the fix |
| "Is X really done?", end of a phase, before a demo | Hollow-Feature Audit |
| "Full QA", "QA everything" | All three |

In Claude Code, run the roles as `qa-smoke-tester`, `qa-bug-wrangler` and `qa-hollow-audit` subagents, in parallel when they're independent. Elsewhere, do them yourself in order.

## Ground rules

- **Evidence or it didn't happen.** "Passed" needs a screenshot, a log line, a console check or a test result from this session. Otherwise it's "not checked".
- **Done means done.** A feature a user can't finish is not complete, no matter what the tracker says.
- **Scale to the change.** A text fix gets one check. A new feature gets the full flow.
- **Check the deploy first.** If the Vercel connector is available, confirm the latest deployment actually succeeded before testing the site.
- **Mobile counts.** Check phone width on every flow you test.
- **Access counts (Max: real weight).** Every smoke test includes a keyboard pass. Access blockers are reported every time, even when the call is SHIP.
- **Reports live in the project being tested,** under `docs/testing/` in that project's repo. Never in AgentMax.
- **Clean up test data.** List every table, account, upload or record a run creates on a live site. Delete it at the end, or get Max's OK to leave it.
- **Role subagents report; the lead writes.** Roles can't edit files or file issues. Henry saves reports and files issues when Max says go.

## What to hand back

```
QA REPORT · <project> · <date> · Lead: Henry
Ran: <roles> · Site: <url> · Deploy: <id / status>

Release call: SHIP IT / SHIP WITH NOTES / HOLD
  (advisory: Max decides)

✅ Works:     <flow — evidence>
❌ Broken:    <flow — what happens — bug link>
🕳️ Hollow:    <item — what's missing to make it real>
♿ Access:    <keyboard / focus / screen-reader findings, or "not checked" with why>
❓ Unchecked: <what we couldn't test and why>
🧹 Test data: <what this run created, and whether it was cleaned up>

Next: <fixes in order of dependency, not effort>
```

Log the run in PROGRESS.md, newest on top, quoting Max's request. If anything needs a push, include commit-message-worthy notes.
