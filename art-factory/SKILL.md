---
name: art-factory
description: Max's Art Factory. Installs and sets up the in-app AI art factory admin panel (queue, review tray, approve/redo/reject, every size cut to WebP), the AI usage & cost tracker, the Make art buttons and the picture maker switcher in any of Max's Next.js projects, wired to that project's art catalogue from Asset Forge. Use when Max wants the art factory, the art admin panel, "make art in the app", the AI cost tracker, or to update the kit in a project; or when a new project from MaxTemplateWithAgents needs its art pipeline.
---

# Art Factory

> "i need to make sure that i have that admin function and control panel available for any of my projects since i generate all AI art" (Max, 2026-10-16)

The kit is DnD-Max's Art Factory (about 215 pictures made, 170 approved), made reusable. This skill puts it into a project and makes it **that project's** factory: its catalogue, its style, its keys, its storage. A kit dropped in with the example list still in it is a hollow feature (rule 9). Done means Max can open `/admin/art-factory` on the live site, make a real picture, approve it, and see it in the app.

## Where the kit is

Use the first one that exists:
1. `kits/art-factory/` in the project (projects started from **MaxTemplateWithAgents** ship it);
2. `kit/` in this skill's own folder (installed with the lineup);
3. `starter/kits/art-factory/` in a checkout of MaxDuderino/AgentMax.

Prefer the newest: compare `version` in each `package.json` and say which you used. Read the kit's `README.md` once before starting.

## What it adds to a project

| Piece | Where |
|---|---|
| Art factory (queue, review tray, styles, pace, credit box) | `/admin/art-factory` |
| Picture maker switcher (OpenAI / Google / free Practice; model and quality with prices) | top of the factory |
| AI usage & credits (wallets, history, failures, price table, Redis and R2 readouts) | `/admin/usage` |
| ✨ Make art buttons | wherever the project builds things |
| Admin sign-in (one `ADMIN_PASSWORD`) | `/admin/login` |

## Steps

Big change to a project: **Checkpoint first.** Ask Max with clickable choices at each **(ask)**.

### 1. Check the project
- It needs **Next.js with the App Router**. No app yet (a fresh template)? **(ask)** "Start the Next.js app now (recommended) / Wait until the app exists". Not Next.js at all? Say plainly the pages and routes won't fit; the `lib/art-factory/server/handlers.ts` doors are plain `Request → Response` and can be mounted by hand, but that is a bigger job: offer it as its own piece of work.
- Does the project have **accounts with an admin**? Then you'll plug in `isAdmin` (and `whoIs` for Make art). If not, the kit's password gate is used.
- Does it already have `/admin/...` pages or `/api/art/...` routes? List any clashes before installing.

### 2. Install
```bash
node <kit>/install.mjs <project> --dry-run
```
Show Max the list in plain English, then run it without `--dry-run`, then `npm install`. The installer copies the kit to `lib/art-factory/` (always replaced; it is kit code), adds pages and routes (never overwrites unless `--force`), adds `art-factory.config.ts` and `art/art-catalogue.json` only if missing, adds variable **names** to `.env.example`, adds three dependencies, and sets the `@/*` import path. A `src/` project gets everything under `src/`.

### 3. Make it this project's catalogue
The catalogue says what to draw, where each file lands and every size it is cut to.
- **Asset Forge feeds the factory.** If the project has `assets/prompts.json`, run Asset Forge's `build_catalogue.py` (in the asset-forge skill folder):
  `python build_catalogue.py assets/prompts.json art/art-catalogue.json`
- No asset list yet? Run **Asset Forge** first (style bible, then the list), then build the catalogue. Never leave the kit's "Space Snacks" example in a real project.
- Sizes: add a `factory.sizes` block to prompts.json with presets for each family at the sizes the app really draws them (look at the components). A token used at 96px and 512px gets both.
- **Style blocks:** one per family in `factory.styles`, written from STYLE.md. These go in front of every picture in that group; Max can edit them in the factory later.
- Things the game already knows (every enemy in its data with no picture yet) can be a **computed** group: see the kit's `examples/computed-catalogue.ts`, wired through `extra` in `art-factory.config.ts`.
- **On approve:** if the app needs to know a picture went live (a creature now has a face), write an `onApprove` hook. Otherwise approved art is simply served at `/api/art/made/<path>`.

### 4. Fill in `art-factory.config.ts`
- `appName` and `prefix` (lower-case, dashes: starts every Redis key, so projects can share one database).
- `makeArtKinds`: the Make art buttons' kinds (character, item, scene, …) with style blocks from STYLE.md and the right shape.
- `isAdmin` / `whoIs` from the project's accounts, if it has them.

### 5. Put the Make art buttons where things are built
Go through the app screen by screen and list where a person names or describes something that has a picture (a character sheet, a level editor, a card builder). **(ask)** which screens get a ✨ Make art button, multiple choice. Each button must **save** the picture into the thing it was made for (`onMade` writes the URL into the project's data and it shows). A button whose picture goes nowhere is a hollow feature.

Show approved art in the app with `artSrc(path)` from `lib/art-factory/ui/api.ts`; it falls back to the `public/` copy until one is approved.

### 6. Keys, storage and memory (Key Keeper rules)
**Names only, never values.** Never ask Max to paste a key into chat, and never write one into a file. Give him these steps, one service at a time, and he types the values into Vercel (Project → Settings → Environment Variables) and his own `.env`:

| Variable | Where Max gets it |
|---|---|
| `ADMIN_PASSWORD` | He makes one up (skip if `isAdmin` is plugged in). Without it the live site locks the factory. |
| `OPENAI_API_KEY_ImageGen` | platform.openai.com → API keys. The only provider with see-through backgrounds. |
| `GOOGLE_API_KEY_ImageGen` | aistudio.google.com → Get API key (optional second provider). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Vercel → the project → Storage → add Upstash Redis; it fills both in. |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare dashboard → R2 → create a **private** bucket; then R2's API tokens page → create a token with object read & write on that bucket. The account id is on the R2 overview page. |

Menu names move; if a label doesn't match, search the provider's help for "API key" or "R2 API token". Then run Key Keeper (`key_scan.py --staged`) before any commit. Storage is **R2, never Vercel Blob**: DnD-Max's Hobby Blob store was blocked after one day of factory writes.

### 7. Check it really works
1. `npx tsc --noEmit` and `npx next build` in the project.
2. Locally with no keys: open `/admin/art-factory`, switch to **Practice**, queue one job, watch it make, approve one, then open its `/api/art/made/<path>` and see it. Try Redo with edited words and Reject. Press a Make art button.
3. Keyboard pass on both admin pages (rule 8a): every button reachable and labelled, focus visible.
4. After deploy, with Max's OK: one real picture on the cheapest model (GPT Image 1 mini, low), approve it, check it in the app and on `/admin/usage`. Then switch back to his normal model.
5. Hand the live check to the **QA Team**. List any test pictures made on the live site and clean them up (Redo or Reject, or remove them from R2), or get Max's OK to keep them.

Be plain about anything you could not check (no keys yet, no deploy yet).

### 8. Wrap
Log it in the project's PROGRESS.md with Max's words, and end with `/wrap`.

## Updating a project's kit
Run `install.mjs` again from the newest kit. `lib/art-factory/` is replaced; the project's config, catalogue and any changed pages are left alone (say which pages differ from the kit so Max can choose `--force`). Kit fixes go into AgentMax's `starter/kits/art-factory/`, never into a project's copy.

## Rules this skill follows
- No hollow features (9): the real catalogue, buttons that save, a real picture approved before calling it done.
- Leaked secrets are the one hard line (George): names only, Key Keeper before commits.
- Access gets real weight (8a): the keyboard pass is part of done.
- "Save it" means real storage (14): R2 and Redis on the live site; memory is for laptops only, and the factory says so on screen.
- Ask, wait, build (11), with clickable choices (12).

## Voice
Studio manager on opening night: thrilled about the art, fussy about the paperwork.
