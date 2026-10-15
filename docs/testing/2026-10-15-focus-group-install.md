# FOCUS GROUP REPORT · AgentMax · 2026-10-15
**{THING}** = an AI agent kit · **{HOST}** = the person installing it for their projects
**Mode:** Quick Playtest (one model voicing all nine testers from their files) · **Tested:** README.md, the install steps, LINEUP.md · **Clicked live site:** n/a (no site)

> "Unless you have a way to approve the agents' usage on a test basis before closing it out as V1.0."

**Headline:** "Say this to start: catch me up" lands with everyone. The install doesn't. Thirteen separate zip uploads lose half the crew, and nothing says how to get the files from a private repo.

| Tester | Seat | Come back? | Loved | Stuck / quit at |
|---|---|---|---|---|
| Pat | Noob | maybe | "Catch me up" and "wrap it": two things to remember | "Upload each zip in dist/ as a skill." Where? What's a skill? Quit at step one. |
| Duke | First-Time Installer | yes | The band table | `install.ps1` "from this folder": which folder? The repo's private, so how does he get it? |
| Nadia | PRO | maybe | The honest status board | No version number, no update command, no uninstall. "How do I get v1.1 without reinstalling by hand?" |
| Grizz | Vet, weak with computers | no | Somebody finally wrote a crew sheet | Subagents, CLAUDE.md, snippets, zips: four new words in the install section alone |
| Sam | Person on the Street | yes | Gets it in 10 seconds from the band table | Nothing; he isn't installing anything |
| Dale | Dad Gamer | maybe | One phrase to start a session | 13 uploads at 11pm. "One button or I'm out." |
| Kai | Teen Gamer | yes | Slash commands | Wants a cheat sheet of every slash command in one place |
| Jax | Pro Live Streamer | yes | A Full Council readout is content; eleven reviewers arguing is a show | Wants the readout to look good in a screenshot |
| Lee | Screen Reader User | yes | Markdown tables read cleanly; headings are real headings | The status emoji read aloud as "check mark button", "test tube", "magnifying glass tilted left". The legend saves it, just. |

## Patterns (3+ testers)
1. **The install is the wall** (Pat, Duke, Grizz, Dale). Too many uploads, too many terms, and no "get the files" step now that the repo is private.
2. **No update path** (Nadia, Dale, Duke). How does a new version reach a machine that already has v1.0?

## Ideas the crew wants (Maxxed)
- **An INSTALL.md guide** written for Grizz: download → click → done, with pictures of where things go.
- **An update script:** `update.ps1` pulls the latest and reinstalls in one go.
- **One slash-command cheat sheet** (Kai).
- **Screenshot-friendly readouts** (Jax).

## Hollow
Nothing hollow found. Every step described exists. It's just too many steps.

## Unchecked
Nobody actually uploaded zips to Claude chat or ran `install.ps1` on Windows. Those wait on Max (shakedown checklist).

## Test data
None created.
