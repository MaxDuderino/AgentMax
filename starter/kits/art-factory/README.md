# Art Factory kit

Max's in-app AI art studio, for any Next.js project. Ported from DnD-Max's Art Factory (about 215 pictures made, 170 approved on the live site), with the DnD-only parts swapped for a **catalogue** each project fills in.

> "i need to make sure that i have that admin function and control panel available for any of my projects since i generate all AI art" (Max, 2026-10-16)

## What you get

| Screen | Where | What it does |
|---|---|---|
| 🎨 **Art factory** | `/admin/art-factory` | Every picture the project needs, in groups. Queue a job, a group or "the next 10"; it starts making. A **review tray** to Approve, Approve all, Redo, Edit words or Reject. Approving cuts the picture to **every size** it is used at (WebP) and puts it live with no deploy. Style blocks per group, pace limits, retry failed, redraw rejected, a credit box that warns when the queue costs more than what is left. |
| 🔀 **Picture maker switcher** | top of the factory | One click: OpenAI or Google, and on OpenAI which model and quality, each with its price. **Practice** draws free placeholders so you can rehearse the whole flow first. |
| 💸 **AI usage & credits** | `/admin/usage` | What is left on each provider (you type in what the console says; it counts down), today / week / month / every month ever, failures by kind, a price table you can correct, Redis and R2 measurements. Any AI call in the project can be recorded here, not just pictures. |
| ✨ **Make art buttons** | anywhere you put `<MakeArtButton>` | Pre-filled words from what is on screen, editable, one click to a picture. Daily cap per person (the admin is never capped). |
| 🔑 **Admin sign-in** | `/admin/login` | One `ADMIN_PASSWORD` for projects without accounts. Projects with accounts plug in their own `isAdmin`. |

Not in the kit (on purpose): DnD-Max's storage mover.

## Lessons from the live run, built in

- **Storage is Cloudflare R2, not Vercel Blob.** DnD-Max's Hobby Blob store was blocked after one day of factory writes.
- **R2 uploads send their length.** Without it R2 answers 411 to every save. The kit signs, then sends raw bytes.
- **The factory stops rather than pay for pictures it cannot keep**: a refusing store, out-of-credit, or two server errors in a row each stop the run, and the picture goes back in the queue untouched.
- **Busy is not failure**: a "slow down" puts the picture back without using up one of its three tries.
- **Leases**: a picture whose function died mid-draw goes back in the queue after 3 minutes.
- **See-through backgrounds** for tokens, icons and items (OpenAI), and a plain-ground retry when a model refuses them.
- **Queueing starts making**: queued pictures do not sit waiting for a second button.

## Install

The `art-factory` skill does all of this for you ("set up the art factory"). By hand:

```bash
node starter/kits/art-factory/install.mjs ../my-game
cd ../my-game && npm install
```

Then fill in `art-factory.config.ts` (name, prefix) and open `/admin/art-factory`. With nothing else set, it runs on your laptop in memory, everyone is the admin, and **Practice** makes free placeholders.

For the live site, set these in Vercel (names only here; values never go in the repo):

| Variable | What for |
|---|---|
| `ADMIN_PASSWORD` | The admin sign-in (skip if the project has its own `isAdmin`) |
| `OPENAI_API_KEY_ImageGen` and/or `GOOGLE_API_KEY_ImageGen` | The picture makers |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | The queue and settings (Vercel → Storage → Upstash adds both) |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Where pictures live (one private bucket) |

## The catalogue: what to draw

`art/art-catalogue.json` is written by **Asset Forge** from the project's style bible and asset list. Groups hold jobs; a job lists images (or one numbered batch prompt the kit cuts up); sizes are presets. Files land at `<root>/<dir>/<file><suffix>.webp`. The format is documented at the top of `lib/art-factory/core/json-catalogue.ts`, and the kit ships a small example ("Space Snacks").

Computed lists (every enemy in the game data with no picture yet) and an **on-approve hook** (tell the game a picture is live) go in `art-factory.config.ts`; see `examples/computed-catalogue.ts`.

## Using approved art in the app

```tsx
import { artSrc } from "@/lib/art-factory/ui/api";
<img src={artSrc("art/icons/heart.webp")} alt="A life" />
```

`/api/art/made/<path>` serves the approved picture, or falls back to `public/<path>` if nothing is approved yet, so committed placeholder art keeps working.

## Recording other AI calls

```ts
import { artFactory } from "@/art-factory.config";
await artFactory.usage.record({ provider: "anthropic", model: "claude-sonnet-5-5", billedTo: "site", ok: true, inputTokens, outputTokens, purpose: "chat" });
```

## Layout

```
lib/art-factory/core/     pure: catalogue, prompts, Make art words (no network)
lib/art-factory/server/   providers, R2, Redis, the queue, usage ledger, admin gate, request handlers
lib/art-factory/ui/       the screens (React) and one self-contained CSS file, light and dark
app/                      Next.js pages and one-line routes
art-factory.config.ts     the project's own settings (the skill fills it in)
art/art-catalogue.json    what to draw (Asset Forge writes it)
install.mjs               installs or updates the kit in a project
tests/                    the kit's own tests (npm test)
```

## Working on the kit

Change the kit here in AgentMax (`starter/kits/art-factory/`), never inside a project: `install.mjs` replaces `lib/art-factory/` on every update. Then:

```bash
cd starter/kits/art-factory && npm install && npm test && npx tsc --noEmit
python tools/build.py
```

`tools/build.py` copies the kit into the `art-factory` skill so the installed skill carries it.
