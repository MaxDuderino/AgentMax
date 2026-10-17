# BVD Full Council · The Art Factory, universal and customizable (2026-10-16)

> "can we have the BVD do a review of the art-factory universal and see what they think and what should be changed or added. the keys for them are UNIVERSAL and CUSTOMIZABLE with configs for the vars/whatever able to be dropped into any app or game type i might come up with or already have! 🙂 This is a HUGE time saver for me, so it is a top tier part of my admintools game and will be heavily used in just about any project. perhaps we need to consider the other AI generated content, like audio.... and i guess just audio type things? let them cook and ill expect a questionaire with feedback sourced direction options and ideas." (Max)

**How it ran:** all eleven seats as separate Claude Code subagents, same brief, reviewing cold. They read the kit's code (read-only; none ran tests or tools). The conductor looked at the live DnD-Max admin in Max's signed-in browser (read only, nothing pressed) and gave them those notes: 907 pictures / 216 approved; $21.28 on 224 pictures ≈ $0.095 each with redos vs 3.5¢ list; both failures were OpenAI safety refusals on game violence; a 117-job group renders as one long scroll; DnD-Max also has a working Voices studio (cast, audition, Pick, cache, 50,000-character daily limit, browser-voice fallback, three providers).

## BVD READOUT · Full Council (all 11)

```
Call:      APPROVE WITH CHANGES, 11 of 11. Grow it into one media-neutral studio
           (pictures, voices, sound), runnable beside any app, before it gets copied
           into more projects.
Why:       The engine is already universal (pure core, plain Request→Response
           handlers). What is not: it only knows pictures, its pages only mount in
           Next.js, its list breaks down at DnD-Max's 907-picture scale, and its
           safety nets are warnings instead of stops.
Flags:     Henry: lease = OpenAI timeout → a slow picture could be paid for twice
             → FIXED this session (lease 7 min > 300 s route limit; test added).
             DnD-Max's live factory has the same 3-minute lease: fix it there.
           Petrus: re-approving a live picture overwrites it with no way back
             → keep the previous version + "Put back".
           George: with no password, the gate trusts NODE_ENV; non-Next hosts may
             not set it → open on localhost only. Installer should make sure .env is
             git-ignored.
           Mattimax: usage ledger is tokens-only with a closed provider list →
             add units (chars/seconds/images) before audio. Additive, nothing breaks.
           Matthew: no alt text anywhere in the catalogue → an alt field per picture.
           GoddiMax: voices can be real people → cloning only with a consent note.
           Randy/DuderMax/Henry: no real OpenAI/Google/R2/Redis call has run through the
             kit yet → one logged real run before calling it Proven.
Next:      Max answers the questionnaire. Then, in dependency order: media-neutral
           core + usage units → safety nets → big-list UI + review mode → audio
           (port DnD-Max's Voices studio) → host shell for non-Next projects →
           polish (themes, celebrations, metrics).
Unchecked: Any real provider/R2/Redis call; real voice/SFX/music providers and
           prices; DnD-Max's audio code (seen only on screen); screen-reader run.
For Max:   The questionnaire below.
```

## Where they agreed (no question needed; the council would build these)
- **One engine for every media type** (Mattimax, DuderMax, Henry, Robert, Randy): a `kind` on every catalogue item (image / voice / sfx / music), one `Maker` interface providers plug into, one queue → review → approve flow, one review card with a media slot (picture, or player + waveform + length + loudness).
- **Usage ledger gets units** (tokens / characters / seconds / images) and an open provider list (Mattimax).
- **The list at scale** (10 of 11 raised it): thumbnail grid, search, filter by status and group, "only unmade", paging, and redo count + cost per item.
- **Cost truth** (DuderMax, Randy, Jerry, Mattimax): show cost per *approved* picture beside list price, and redo rate per group, on the usage page.
- **Audio review rules** (Matthew, Richie, George, Petrus): never autoplay; a named ▶ button and Space to play; the line's text shown as its transcript; daily character cap checked before the call; cache-first; browser voice as the free fallback.
- **Alt text and captions** (Matthew, GoddiMax): an `alt` per picture and a `caption` per sound, editable in review, handed to the game with the file.
- **Access fixes** (Matthew, Robert): focus moves to the next card after each decision; the wait countdown stops chattering in the screen-reader live region; nav uses aria-current only; emoji hidden from screen readers.

## Each seat in one line
| Seat | Verdict | Headline |
|---|---|---|
| DuderMax (then "Max Bullis") | Approve w/ changes | Full studio (images, voices, SFX, music), port the Voices studio as-is, standalone admin app for non-Next, call it "Max Studio". |
| Mattimax | Approve w/ changes | Media-neutral core and usage units first, or we pay for the refactor twice; then storage/KV/host adapters. |
| GoddiMax | Approve w/ changes | Voices can be real people: consent note for clones; alt text and captions as approval data. |
| Matthew | Approve w/ changes | Alt text field; focus kept in the tray; quiet live region; transcripts and no autoplay for audio. |
| Henry | Approve w/ changes | Lease bug (fixed); a logged real run per provider; resumable approve; reach picture #900 in 5 keystrokes. |
| Petrus | Approve w/ changes | Keep previous versions; refuse paid pictures on memory storage live; stop-at-zero on by default plus a per-run limit. |
| Richie | Approve w/ changes | Tray mode with A/R/E/X keys; a payoff when a group is done; "Asset Factory" with Art/Voices/SFX/Music tabs. |
| Randy | Approve w/ changes | Shake it down on DnD-Max with 10 real maps first; a standalone sidecar server; refusal helper. |
| Robert | Approve w/ changes | Gallery not spreadsheet: grid + review mode; a theme block in the config with presets; "Content Factory". |
| George | Approve w/ changes | No-password mode only on localhost; installer git-ignores .env; voice cloning off by default. |
| Jerry | Approve w/ changes | Edited words get lost in Redis: export them back to prompts.json; a decision log per picture; name an owner for audio. |

Names suggested: Content Factory (Mattimax, Robert, Henry), Max Studio (seat 01), Asset Factory (Richie), rename later once audio is proven (Jerry, Randy).

## Questionnaire for Max
Asked in the session as clickable choices; his answers are recorded below when given.

1. **What should it make?** Pictures only, polished · Pictures + voices · Pictures + voices + sound effects · Full studio incl. music (seat 01: full; Henry, Petrus: voices + SFX first).
2. **Name?** Keep "Art Factory" · Content Factory · Max Studio · Asset Factory.
3. **Projects that aren't Next.js?** Standalone admin server any game runs beside it · Adapter per framework · Next only for now.
4. **Proof before "Proven"?** One cheap real run per provider, logged · Plus a shakedown on DnD-Max (10 real maps) · Mock tests are enough.
5. **Reviewing feel?** Review mode with keys + grid toggle · Keep cards · Swipe deck.
6. **Safety refusals?** Soften-the-words rewrite you confirm · Retry on the other provider · Both · Edit by hand.
7. **Safety nets on by default?** (multi) Keep previous versions + Put back · Stop-at-zero on + per-run limit · Refuse paid pictures with no storage live · No-password = localhost only.
8. **Voice cloning?** Off, consent note to allow · Never · No rule.
9. **Alt text and captions?** Asset Forge drafts, you edit in review · AI describes the finished picture · Leave to each project.
10. **Your prompt fixes?** Export button, merged into prompts.json by the skill · Auto-sync · Stay in Redis.
11. **Look per project?** Config theme + presets + live picker · Config only · Edit CSS.
12. **When a group is finished?** Quiet banner + contact sheet (fanfare optional) · Nothing · Full fanfare.

## Max's answers (2026-10-16, his clicks and words)
| # | Question | Max's answer |
|---|---|---|
| 1 | What should it make? | **Full studio**: "you know i want the full studio.... lol" (pictures, voices, sound effects, music) |
| 2 | Name | **Content Factory MAX** ("i love having Max in almost any name or creation i can… Everything is Maxxxxxxxxxed lol") |
| — | Seat 01's name | **DuderMax**. "an AI logging things as my name? i dont want this… please update in all agent configs." Done this session (see PROGRESS). |
| 3 | Non-Next projects | **Next.js only for now** |
| 4 | Proof before Proven | **Real runs + DnD-Max shakedown** (one logged real run per provider, then 10 real maps in DnD-Max on a branch, in that repo) |
| 5 | Review feel | **Review mode + grid toggle** |
| 6 | Safety refusals | **Both**: soften the words (shown before redraw) or try the other provider |
| 7 | Safety nets on by default | **Keep old versions + Put back** and **Stop at zero + per-run limit**. Not picked: refusing paid pictures without storage (stays a warning), localhost-only no-password mode (stays NODE_ENV-based) |
| 8 | Voice cloning | **No rule** (GoddiMax and George flagged consent; Max's call stands, advisory council) |
| 9 | Alt text and captions | **Asset Forge drafts, you edit in review** |
| 10 | Prompt fixes | **Saved to that project's own art list, versioned**. Never AgentMax or the template ("i dont want it changing my template base image with a change from boogermax.com") |
| 11 | Look per project | **Config theme + presets + live picker** |
| 12 | Group finished | **Banner + contact sheet**, optional fanfare sound |

## The build plan (from the answers, in dependency and risk order; effort never decides)
**Phase 1 · The engine becomes media-neutral** (everything else stands on it)
- Rename kit and skill to **Content Factory MAX** (`starter/kits/content-factory-max/`, skill `content-factory-max`), keeping an alias so "art factory" still finds it.
- `kind` on every catalogue item (image / voice / sfx / music); one `Maker` interface; usage ledger with units (tokens / characters / seconds / images) and an open provider list.
- Safety nets on by default: previous versions + Put back (30 days); stop-at-zero on; a per-run spending limit. Lease fix (done).
- Approve made resumable (write every size, then record); retry for a failed on-approve hook.
- Alt text per picture and caption per sound in the catalogue; Asset Forge drafts them; editable in review.

**Phase 2 · Working at 907-item scale**
- Grid view with thumbnails, search, filters (status, group, failed reason), "only unmade", paging; redo count and cost per item.
- Review mode: one item big, next to its set; A / R / E / X and arrow keys; focus moves on; quiet live region.
- Refusal helper: soften-the-words rewrite you confirm, or retry on the other provider.
- Cost truth on the usage page: cost per approved item vs list price, redo rate per group.
- Prompt fixes exported into the project's own `prompts.json` as numbered versions (the skill merges; never the template).

**Phase 3 · The Sound Stage**
- Port DnD-Max's Voices studio: cast, sample line, ▶ audition candidates, Pick with no deploy, style note, cache, daily character cap, browser-voice fallback; Gemini TTS, Chirp 3 HD, ElevenLabs.
- Sound effects and music on the same queue → review → approve, with a player, waveform, length, loudness and loop check; never autoplay; transcript beside every line.
- Voice cloning allowed with no extra gate (Max's answer).

**Phase 4 · Make it yours**
- Theme block in the config, 3–4 presets, live picker on the admin page.
- Group-finished banner and contact sheet; optional fanfare.

**Phase 5 · Proven**
- One logged real run per provider (cheapest model, stop-at-zero on), cleaned up.
- Shakedown in DnD-Max on a branch with a checkpoint: 10 real maps; compare cost per picture with the old panel. Done in the DnD-Max repo.

Not now (Max's answers): non-Next hosts (Next.js only for now); refusing paid work without storage; localhost-only admin.
Also for DnD-Max itself: its live factory has the same 3-minute lease Henry found; fix it there.
