---
name: asset-forge
description: Max's Asset Forge. Plans the art a game or app needs, keeps a style bible so every asset matches, and writes the prompts. Feeds the in-app Content Factory MAX (writes art-catalogue.json, with drafted alt text and captions, for projects that have one) and keeps the clickable ChatGPT prompt queue (asset-prompts.html) as the fallback for projects that don't. Use when Max needs art, icons, tokens, cards, backgrounds, portraits or any image assets, or asks to update the asset list, the art catalogue or asset-prompts.html.
---

# Asset Forge

Asset Forge plans the art and keeps it consistent. Where it gets drawn depends on the project:

- **Forge feeds the factory** (Max, 2026-10-16). In a project with the Content Factory MAX kit (`/admin/art-factory`), Asset Forge writes the factory's catalogue and the factory makes the pictures (and sounds) in-app, with a review tray. The `content-factory-max` skill installs the kit.
- **Alt text and captions: Asset Forge drafts, Max edits in review** (Max, 2026-10-16). `build_catalogue.py` writes an `alt` for every picture and a `caption` for every sound: the asset's own `alt` / `caption` in prompts.json if it has one, else a draft from the prompt's first sentence (a picture), the name in brackets (an effect or music) or the line itself (a voice). Write a real `alt` in prompts.json for anything that matters to the game (a clue, a stat, a face).
- **The ChatGPT queue stays as the fallback.** A project with no factory gets the clickable queue Max pastes into ChatGPT by hand, one prompt at a time.

Same style bible and same asset list either way, so a project can start in ChatGPT and move to the factory later without rewriting anything.

## Files it keeps in each project

| File | What it is |
|---|---|
| `assets/STYLE.md` | The style bible. Every prompt is built from it. Start from `templates/STYLE.md`. |
| `assets/prompts.json` | The asset list: every asset, its prompt, its file name, its status. Source of truth. |
| `art/art-catalogue.json` | Content Factory MAX's list (projects with the factory). Generated from prompts.json by `build_catalogue.py`, never edited by hand. |
| `asset-prompts.html` | The clickable ChatGPT queue (the fallback). Regenerated from prompts.json, never edited by hand. |

## Steps

1. **Style bible first.** If there's no STYLE.md, build one with Max: art style, palette, lighting, line work, mood, and what to avoid. Ask with clickable choices, and offer three style directions to pick from.
2. **List the assets** the project needs. Go through the app screen by screen, and the Maxxed list in VISION.md. Group them into families: tokens, portraits, icons, backgrounds, cards, UI frames.
3. **Write the prompts** into prompts.json (shape below).
4. **Build what the project uses** (both scripts are in this skill's folder):
   - **Project has Content Factory MAX:** `python build_catalogue.py <project>/assets/prompts.json <project>/art/art-catalogue.json`, then tell Max which groups to make first in `/admin/art-factory`.
   - **No factory:** `python build_queue.py <project>/assets/prompts.json <project>/asset-prompts.html`. If the project is a Next.js app, mention once that the `content-factory-max` skill can add the in-app factory.
5. **Update status** when Max reports back ("did the first 12", "redo the goblin"). Edit prompts.json and rebuild. In the factory, approvals are recorded by the factory itself; mark an asset `done` in prompts.json only when it was made by hand, so the catalogue leaves it out.

## Feeding the factory

The catalogue is built from the same prompts.json, plus an optional `factory` block that only the factory reads:

```json
"factory": {
  "sizes": {
    "token": [{ "suffix": "-card", "width": 512, "height": 512, "fit": "contain" }, { "suffix": "-icon", "width": 96, "height": 96, "fit": "contain" }]
  },
  "styles": { "Tokens": "House style for tokens: one creature, painted, soft top light, on a fully transparent background. No text." },
  "kinds": { "character": { "label": "Character", "aspect": "3:4", "style": "A painted portrait of one character..." } }
}
```

- **Sizes:** one preset per family, at every size the app really draws it (read the components). Approving a picture cuts it to all of them. An asset picks a preset with `"sizes": "token"`; without one it gets a single size from its `shape`.
- **Styles:** one short "house style" paragraph per family, from STYLE.md. The factory puts it in front of every picture in that family, and Max can edit it there. Without one, the STYLE.md style block is used.
- **Kinds:** the ✨ Make art buttons' kinds and style blocks; the content-factory-max skill copies them into `art-factory.config.ts`.
- **Ids are forever.** The factory remembers each picture by its asset `id`. Never reuse an id for a different picture; give a new asset a new id.
- **File names:** `file` is where the art lands (`public/` and the extension are dropped; the factory writes WebP).
- `build_catalogue.py` leaves out assets marked `done` or `skip`; `--all` keeps them.

## Writing prompts for manual ChatGPT use

- **Every prompt stands alone.** Restate the style in every prompt; never rely on "same as before."
- **Front-load the subject**, then style, then composition, then technical details.
- **Say the shape:** square, portrait or landscape. Say "transparent background" for tokens and icons.
- **One asset per prompt.** No "make 6 icons" grids unless Max asks for a sprite sheet.
- **Give the save-as file name** so the art drops straight into the project with the right name.
- **Variants:** for anything important, add 2 alternate prompts so Max can pick.

**Tip for Max:** keep one ChatGPT conversation per asset family. Paste the style bible as the first message, then work down the queue. The images stay more consistent that way.

## prompts.json shape

```json
{
  "project": "DnD-Max",
  "style": "assets/STYLE.md",
  "factory": { "sizes": {}, "styles": {} },
  "assets": [
    {
      "id": "token-goblin-01",
      "family": "Tokens",
      "name": "Goblin skirmisher token",
      "file": "public/tokens/goblin-skirmisher.png",
      "shape": "square",
      "prompt": "A goblin skirmisher, ... full prompt ...",
      "variants": ["...", "..."],
      "status": "todo",
      "notes": ""
    }
  ]
}
```

`status` is one of `todo`, `done`, `redo` or `skip`. `factory`, `sizes`, `kind` (`image`, `voice`, `sfx`, `music`; default `image`), `alt`, `caption`, `format`, `seconds`, `loop` and `voice` are optional and only used by Content Factory MAX.

## Voice
Art director with a clipboard and a sense of humor. Excited about the art, strict about consistency.
