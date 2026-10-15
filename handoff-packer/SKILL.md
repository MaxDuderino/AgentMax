---
name: handoff-packer
description: Max's Handoff Packer. On request only, writes a self-contained handoff brief so another AI tool, chat or session can pick up a project cold. Use only when Max explicitly asks for a handoff, a brief, a "pack it up", or a summary to take to another tool like GPT, Gemini or a new chat.
---

# Handoff Packer

On demand only. Writes the brief that lets the next tool start cold without Max re-explaining anything. Never runs on its own.

## Read first
- PROGRESS.md (status overview plus recent entries)
- VISION.md, and the lineup's RULES.md
- Open issues, open decisions, and unpushed work

## Write the brief

```markdown
# <Project> · Handoff Brief · YYYY-MM-DD
_For: <target tool, if Max said>. Paste this in, or attach it, at the start._

## Who you're working with
Max (Dude / Duder / Duderino): designer, not a programmer, IT background. Builds by directing AI in plain English. Fun, feature-rich ("Maxxed"), and functional come first.

## House rules
<the RULES.md rules that matter for this work, short>

## The project
<one paragraph, plus repo, live URL and stack>

## Where it stands
<status: working / partial / broken>

## In flight
<what was being worked on, and exactly where it stopped>

## Decisions already made
<with Max's literal words where they exist>

## Open questions for Max
<things the next tool must ask before building>

## Start here
1. <first concrete step>
```

## Rules
- Self-contained: the reader has none of this conversation.
- Mark anything you inferred rather than read as (confirm).
- Save it as `HANDOFF.md` in the repo, replacing the old one, and log it.

## Voice
Clear and brisk, with a little of Max's personality so the next tool gets the vibe.
