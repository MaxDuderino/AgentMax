---
name: focus-group
description: Runs Max's Focus Group, an 8-tester playtest crew (Noob, First-Time Host, PRO, Vet, Person on the Street, Dad Gamer, Teen Gamer, Pro Live Streamer) against any app or game. Use only when Max asks for a playtest, focus group, demo crew, demo weekend, or for the testers by name (Pat, Duke, Nadia, Grizz, Sam, Dale, Kai, Jax).
---

# Focus Group

Eight testers who play Max's builds the way real people would, then report back. They work for any app or game: their specialty is filled in per project.

Runs **only when Max asks**.

## The crew

| Tester | Seat | Breaks the app by |
|---|---|---|
| Pat | The Noob | Not knowing anything |
| Duke | The First-Time {HOST} | Hosting under pressure |
| Nadia | The PRO | Comparing it to the best tools out there |
| Grizz | The Vet | Doing it the real-world way, weak with computers |
| Sam | The Person on the Street | Not caring |
| Dale | The Dad Gamer | Having 45 minutes and a baby monitor |
| Kai | The Teen Gamer | Mashing, swiping and exploiting |
| Jax | The Pro Live Streamer | Playing it live for chat |

Persona files live in `testers/`. Read the file for every tester you use.

## Step 1: Fill in the blanks

Every persona file uses two placeholders. Fill them from the project's VISION.md or README before the test, and state them at the top of the report.

- **{THING}**: what the project is. "tabletop RPGs" for DnD-Max, "Canasta" for CanastaMax, "online debates" for MasterDebater.
- **{HOST}**: who runs a session. "DM", "dealer", "moderator", or "host".

If you can't tell, ask Max with a quick multiple-choice question.

## Step 2: Pick the mode

**Quick Playtest (default).** You voice the testers yourself from their files. Max can name a subset ("just Pat and Grizz").

**Full Playtest.** When Max says "full playtest", "whole crew", or "demo weekend".
- **In Claude Code:** launch the eight `fg-<slug>` subagents in parallel in one message, each with the same brief and the live URL. Each tests in their own context.
- **Without subagents:** voice all eight yourself, and say so.

If browser tools are available, testers **actually click through the live site**. A tester who only read the code says so. Never report something as tried unless it was.

## Step 3: Run the session

1. **First look.** Each tester opens it cold. What do they understand in the first minute?
2. **Play.** Each tester tries to do the main thing the app is for, their way.
3. **Together.** The multiplayer or shared parts: invite links, joining, taking turns.
4. **Real-world check.** How does it compare to playing {THING} without the app, or with the tool they use today?
5. **Report.** Hand the findings to Max, and to the BVD if he asks.

## What to hand back

```
FOCUS GROUP REPORT · <project> · {THING} / {HOST} = <filled in>
Mode: Quick or Full · Testers: <who> · Clicked live site: yes/no

Headline: <the one thing to fix or keep>

<Tester> (<seat>): would they come back? yes / maybe / no
  Loved:   ...
  Stuck:   <exact screen and step>
  Quit at: <if they quit>
  Wish:    <feature they asked for>

Patterns:  <issues 3+ testers hit>
Ideas:     <features the crew wants, Maxxed>
Hollow:    <anything that looked like a feature but went nowhere>
Unchecked: <what nobody could try>
```

Bugs found go to the QA Team's Bug Wrangler. Log the session in PROGRESS.md, newest on top, with a quote of Max's request.
