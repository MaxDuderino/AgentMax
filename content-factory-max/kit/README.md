# Content Factory MAX kit

Max's in-app AI content studio, for any Next.js project: pictures, voice lines, sound effects and music on **one** queue → review → approve engine. Ported from DnD-Max's Art Factory (about 215 pictures made, 170 approved on the live site), with the DnD-only parts swapped for a **catalogue** each project fills in. Formerly the Art Factory kit; renamed and made media-neutral on 2026-10-17 (phase 1 of the BVD plan in `council/2026-10-16-art-factory-review.md`).

> "i need to make sure that i have that admin function and control panel available for any of my projects since i generate all AI art" (Max, 2026-10-16)
>
> "you know i want the full studio.... lol" (Max, 2026-10-16, picking the full studio and the name Content Factory MAX)

**Where it stands.** Pictures: everything below, working. Sounds: the engine, the catalogue, the review player, captions, usage in units and free Practice placeholders are in. The real voice, effect and music makers (DnD-Max's Voices studio, ElevenLabs and friends) come with phase 3, the Sound Stage; until then a project can plug in its own maker (see *Makers*). The code keeps its `art-factory` paths so projects that have the kit update in place.

## What you get

| Screen | Where | What it does |
|---|---|---|
| 🏭 **Content Factory MAX** | `/admin/art-factory` | Every picture and sound the project needs, in groups. Queue a job, a group or "the next 10"; it starts making. A **review tray** to Approve, Approve all, Redo, Edit words or Reject. Approving cuts a picture to **every size** it is used at (WebP) and puts it live with no deploy; a sound is written as it came. Sounds get a named ▶ player that never plays by itself. Alt text and captions are edited on each review card. Style blocks per group, pace limits, a per-run spending limit, retry failed, redraw rejected, Put back, a credit box that warns when the queue costs more than what is left. |
| 🔀 **Maker switcher** | top of the factory | One click: OpenAI or Google, and on OpenAI which model and quality, each with its price. **Practice** makes free placeholders (pictures and sounds) so you can rehearse the whole flow first. |
| 💸 **AI usage & credits** | `/admin/usage` | What is left on each provider (you type in what the console says; it counts down), today / week / month / every month ever, failures by kind, tokens **and** characters / seconds / pictures, a price table you can correct (per token or per unit), Redis and R2 measurements. Any AI call in the project can be recorded here, from any provider. |
| ✨ **Make art buttons** | anywhere you put `<MakeArtButton>` | Pre-filled words from what is on screen, editable, one click to a picture. Daily cap per person (the admin is never capped). |
| 🔑 **Admin sign-in** | `/admin/login` | One `ADMIN_PASSWORD` for projects without accounts. Projects with accounts plug in their own `isAdmin`. |

Not in the kit (on purpose): DnD-Max's storage mover.

## Working at scale (phase 2, 2026-10-17)

Built for DnD-Max's size: 907 pictures, 117 in one group.

- **Grid view** (beside "By job" in the list): every item as a thumbnail with its status, redos and cost; search (press `/` from anywhere), filters by status, kind and group, "only unmade" and "refused by a safety filter", 48 a page, and **Make the N new ones shown**. Pick a tile for its full line (Words, Put back, Queue…).
- **Review mode** (in the review tray): one item big, the rest of its set beside it. Keys: **A** approve, **X** reject, **R** redo, **E** edit words, **← →** move, **Esc** close. The screen reader hears one line per decision ("Approved. 3 left. Now: Star"), not a ticking clock.
- **Refusal helper** (on a refused item, under the tray): **Soften the words** swaps the words safety filters trip on ("bloody" → "battle-worn") and shows every change; you edit and confirm before anything is redrawn. Or **Try Google / OpenAI instead**, for that one draw.
- **Cost truth** (usage page): what an approved item really cost, redos and refusals included, beside the list price of one draw, with draws, redo rate and refusals per group.
- **Prompt fixes go home, versioned**: **Export prompt fixes** downloads the words, alt text and style blocks edited here; Asset Forge's `merge_fixes.py` puts them into the project's own `assets/prompts.json` as new numbered versions (the old words kept in each asset's `history`). It refuses AgentMax and the MaxTemplateWithAgents template.
- **Access**: focus moves to the next card after Approve / Redo / Reject; the wait countdown is said once; the admin nav uses `aria-current` only; emoji are hidden from screen readers.

## Safety nets, on by default (Max, 2026-10-16)

- **Keep old versions + Put back.** Re-approving something that is live copies the live files to `art-factory/previous/…` first. The list shows **↶ Put back the earlier one**; putting back keeps the newer one too, so you can swap again. Kept versions are tidied away after 30 days (at most 10 per item).
- **Stop at zero.** On for every new wallet on the usage page (a wallet saved with it off stays off). It stops a provider once the estimated credit you typed in runs out.
- **Per-run spending limit.** Each press of Start making is a run; it stops before the try that would take it past the limit ($5 unless changed, beside the pace; empty is no limit). With several lanes at once it can go over by about one picture per lane.
- **Resumable approve.** Every file is written first, then all are recorded, then the review copy is removed. Interrupted anywhere, Approve again carries on, and never mistakes the new picture for the "previous" one.
- **On-approve hook retry.** A hook that throws never undoes the approval: the item says so and gets **↻ Tell the app again**.

## Lessons from the live run, built in

- **Storage is Cloudflare R2, not Vercel Blob.** DnD-Max's Hobby Blob store was blocked after one day of factory writes.
- **R2 uploads send their length.** Without it R2 answers 411 to every save. The kit signs, then sends raw bytes.
- **The factory stops rather than pay for things it cannot keep**: a refusing store, out-of-credit, or two server errors in a row each stop the run, and the item goes back in the queue untouched.
- **Busy is not failure**: a "slow down" puts the item back without using up one of its three tries.
- **Leases**: an item whose function died mid-make goes back in the queue after 7 minutes (longer than any route may run, so a slow picture is never paid for twice).
- **See-through backgrounds** for tokens, icons and items (OpenAI), and a plain-ground retry when a model refuses them.
- **Queueing starts making**: queued items do not sit waiting for a second button.

## Install

The `content-factory-max` skill does all of this for you ("set up the content factory", or "the art factory"). By hand:

```bash
node starter/kits/content-factory-max/install.mjs ../my-game
cd ../my-game && npm install
```

Then fill in `art-factory.config.ts` (name, prefix) and open `/admin/art-factory`. With nothing else set, it runs on your laptop in memory, everyone is the admin, and **Practice** makes free placeholders.

For the live site, set these in Vercel (names only here; values never go in the repo):

| Variable | What for |
|---|---|
| `ADMIN_PASSWORD` | The admin sign-in (skip if the project has its own `isAdmin`) |
| `OPENAI_API_KEY_ImageGen` and/or `GOOGLE_API_KEY_ImageGen` | The picture makers |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | The queue and settings (Vercel → Storage → Upstash adds both) |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Where pictures and sounds live (one private bucket) |

## The catalogue: what to make

`art/art-catalogue.json` is written by **Asset Forge** from the project's style bible and asset list. Groups hold jobs; a job lists items (or one numbered batch prompt the kit cuts up); sizes are presets. Pictures land at `<root>/<dir>/<file><suffix>.webp`. The format is documented at the top of `lib/art-factory/core/json-catalogue.ts`, and the kit ships a small example ("Space Snacks", with a few sounds).

**Kinds.** Everything is a picture unless a group, job or item says `"kind": "voice" | "sfx" | "music"`. A sound has no sizes; it lands at `<root>/<dir>/<file>.mp3` (or `format`: wav, ogg) and can say `seconds`, `loop` and `voice`. A voice line's words are what is read; the group's style goes alongside as direction.

**Alt text and captions.** `alt` on a picture, `caption` on a sound (a voice line's caption defaults to its line). Asset Forge drafts them; edits made in review win, and are kept for this project.

Computed lists (every enemy in the game data with no picture yet) and an **on-approve hook** (tell the game a picture is live) go in `art-factory.config.ts`; see `examples/computed-catalogue.ts`. Computed items with no `kind` are pictures, so older computed lists need no change.

## Using approved art in the app

```tsx
import { artSrc } from "@/lib/art-factory/ui/api";
import { useArtText } from "@/lib/art-factory/ui/use-art-text";

useArtText(); // loads every alt text and caption once
const heart = artSrc("art/icons/heart.webp", { withText: true });
<img src={heart.src} alt={heart.alt} />
```

`artSrc(path)` on its own still returns just the address. `/api/art/made/<path>` serves the approved file, or falls back to `public/<path>` if nothing is approved yet, so committed placeholder art keeps working. `/api/art/text` serves the alt texts and captions (public, cached five minutes).

## Makers

Every maker comes through one door (`lib/art-factory/server/maker.ts`): a `name`, the `kinds` it makes, and `make(request)`. The switcher's OpenAI, Google and Practice keep working exactly as before. To add a voice, effect or music maker before the Sound Stage ships, hand it to the config:

```ts
export const artFactory = createArtFactory({
  // …
  makers: [
    {
      name: "my-tts",
      model: "voice-1",
      kinds: ["voice"],
      async make({ prompt, voice }) {
        const bytes = await callMyVoiceService(prompt, voice);
        return { ok: true, bytes, contentType: "audio/mpeg", usage: { model: "voice-1", unit: "characters", quantity: prompt.length } };
      },
    },
  ],
});
```

It is metered under its own name, in its own unit, and stopped at zero like the others. On **Practice**, every kind without a real maker gets free placeholder sounds.

## Recording other AI calls

```ts
import { artFactory } from "@/art-factory.config";
await artFactory.usage.record({ provider: "anthropic", model: "claude-sonnet-5-5", billedTo: "site", ok: true, inputTokens, outputTokens, purpose: "chat" });
// Billed by something else? Say the unit: characters, seconds or images.
await artFactory.usage.record({ provider: "elevenlabs", model: "eleven_flash_v2_5", billedTo: "site", ok: true, inputTokens: 0, outputTokens: 0, unit: "characters", quantity: line.length, purpose: "narration" });
```

Any lower-case provider id works (`suno`, `my-tts`): it gets its own line and wallet once used. Rows recorded before units existed read exactly as before.

## Layout

```
lib/art-factory/core/     pure: catalogue, kinds, prompts, Make art words (no network)
lib/art-factory/server/   makers and providers, R2, Redis, the queue, usage ledger, admin gate, request handlers
lib/art-factory/ui/       the screens (React) and one self-contained CSS file, light and dark
app/                      Next.js pages and one-line routes
art-factory.config.ts     the project's own settings (the skill fills it in)
art/art-catalogue.json    what to make (Asset Forge writes it)
install.mjs               installs or updates the kit in a project
tests/                    the kit's own tests (npm test)
```

## Working on the kit

Change the kit here in AgentMax (`starter/kits/content-factory-max/`), never inside a project: `install.mjs` replaces `lib/art-factory/` on every update. Then:

```bash
cd starter/kits/content-factory-max && npm install && npm test && npx tsc --noEmit
python tools/build.py
```

`tools/build.py` copies the kit into the `content-factory-max` skill so the installed skill carries it.
