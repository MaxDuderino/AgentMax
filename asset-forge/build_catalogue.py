"""Builds art-catalogue.json, Content Factory MAX's list of what to make, from prompts.json.

Usage:  python build_catalogue.py assets/prompts.json art/art-catalogue.json [--all]

prompts.json stays the one source of truth. This writes the catalogue the
in-app Content Factory MAX reads (the content-factory-max kit), the same way build_queue.py
writes the ChatGPT queue. Never edit the catalogue by hand: change
prompts.json and run this again.

  - Each family becomes a group; each folder within a family becomes a job.
  - Each asset keeps its id, so the factory remembers it even if the list
    is reordered.
  - Assets marked done or skip are left out (they were made by hand, or are
    not wanted). --all keeps them.
  - The optional "factory" block in prompts.json sets size presets and a
    style block per family. Without one, the style block comes from STYLE.md
    ("## Style block") and sizes from each asset's shape.
  - "kind" on an asset (image, voice, sfx, music; default image) makes it a
    sound: no sizes, saved as <file>.<mp3|wav|ogg>, with "seconds", "loop"
    and "voice" handed to the maker.
  - Alt text and captions are drafted for Max to edit in review (Max,
    2026-10-16): an asset's own "alt" / "caption" if it has one, else the
    prompt's first sentence for a picture, the line itself for a voice, and
    the name in brackets for an effect or music.
"""
import json
import re
import sys
from pathlib import Path

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if len(args) != 2 or "-h" in sys.argv or "--help" in sys.argv:
    print(__doc__)
    sys.exit(0 if ("-h" in sys.argv or "--help" in sys.argv) else 2)
KEEP_ALL = "--all" in sys.argv
src, out = Path(args[0]), Path(args[1])
data = json.loads(src.read_text(encoding="utf-8"))
factory = data.get("factory", {})

# Sizes by shape, used when an asset names no preset. Transparent-ground assets keep their whole silhouette ("contain").
SHAPE_SIZES = {
    "square": {"width": 1024, "height": 1024},
    "portrait": {"width": 768, "height": 1024},
    "landscape": {"width": 1536, "height": 1024},
    "wide": {"width": 1920, "height": 1080},
    "tall": {"width": 1080, "height": 1920},
}


def slug(text, fallback="item"):
    s = re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")
    return s or fallback


KINDS = ("image", "voice", "sfx", "music")
SOUND_FORMATS = ("mp3", "wav", "ogg")


def first_sentence(text, limit=160):
    """The opening sentence of a prompt, as a first draft of a picture's alt text."""
    words = re.sub(r"\s+", " ", str(text)).strip()
    head = re.split(r"(?<=[.!?])\s", words, maxsplit=1)[0]
    head = re.split(r"\b(?:in the style of|style:|art style|rendered|digital painting|trending on)\b", head, flags=re.I)[0].strip(" ,;:-")
    # Drawing instructions say how to draw it, not what it shows: no help to someone listening.
    head = re.sub(r",?\s*\b(?:on\s+)?(?:a\s+)?(?:fully\s+)?(?:transparent|white|plain|solid|clear)\s+(?:back)?ground\b|,?\s*\bno (?:text|borders?|shadows?)\b|,?\s*\bcent(?:er|re)d\b|,?\s*\bhigh(?:ly)? detail(?:ed)?\b", "", head, flags=re.I).strip(" ,;:-")
    if len(head) > limit:
        head = head[: limit - 1].rsplit(" ", 1)[0] + "…"
    if head and head[-1] not in ".!?…":
        head += "."
    return head[:1].upper() + head[1:]


def draft_text(asset, kind, name):
    """Alt text (picture) or caption (sound): the asset's own, else a draft."""
    if kind == "image":
        return (asset.get("alt") or "").strip() or first_sentence(asset.get("prompt", ""))
    own = (asset.get("caption") or "").strip()
    if own:
        return own
    if kind == "voice":
        return re.sub(r"\s+", " ", asset.get("prompt", "")).strip()
    return f"[{name}]"


def style_from_bible():
    """The first quoted paragraph under '## Style block' in STYLE.md, if there is one."""
    bible = data.get("style")
    if not bible:
        return ""
    for base in (src.parent, src.parent.parent, Path.cwd()):
        path = (base / bible) if not Path(bible).is_absolute() else Path(bible)
        if path.exists():
            text = path.read_text(encoding="utf-8")
            # Line by line (no DOTALL): the heading, any non-quote lines under it, then only the quoted lines that follow.
            match = re.search(r"^##[ \t]*Style block[^\n]*\n(?:(?!##)(?!>)[^\n]*\n)*?((?:>[^\n]*(?:\n|$))+)", text, re.M | re.I)
            if match:
                quote = " ".join(line.lstrip("> ").strip() for line in match.group(1).splitlines()).strip()
                return "" if quote.startswith("<") else quote
            return ""
    return ""


def sizes_for(asset):
    wanted = asset.get("sizes")
    if wanted:
        return wanted  # a preset name, or an inline list
    shape = SHAPE_SIZES.get(asset.get("shape", "square"), SHAPE_SIZES["square"])
    clear = bool(re.search(r"transparen", asset.get("prompt", ""), re.I)) and not re.search(r"\bno\s+transparen", asset.get("prompt", ""), re.I)
    return [{"suffix": "", **shape, "fit": "contain" if clear else "cover"}]


default_style = style_from_bible()
styles = factory.get("styles", {})
groups = {}
problems = []
seen_ids = set()
skipped = 0

for asset in data.get("assets", []):
    status = asset.get("status", "todo")
    if status in ("done", "skip") and not KEEP_ALL:
        skipped += 1
        continue
    if not asset.get("prompt", "").strip():
        problems.append(f'{asset.get("id")}: no prompt')
        continue
    kind = asset.get("kind") or "image"
    if kind not in KINDS:
        problems.append(f'{asset.get("id")}: kind "{kind}" is not one of {", ".join(KINDS)}')
        continue
    if kind == "image" and isinstance(asset.get("sizes"), str) and asset["sizes"] not in factory.get("sizes", {}):
        problems.append(f'{asset.get("id")}: size preset "{asset["sizes"]}" is not in the factory block sizes')
        continue
    family = asset.get("family") or "Other"
    file = str(asset.get("file") or f'{slug(asset.get("name"))}.webp').replace("\\", "/")
    file = re.sub(r"^\.?/?public/", "", file)
    folder, _, name = file.rpartition("/")
    stem = re.sub(r"\.[a-z0-9]+$", "", name, flags=re.I)
    extension = name[len(stem) + 1:].lower()
    image_id = re.sub(r"[^A-Za-z0-9_-]+", "-", str(asset.get("id") or stem)).strip("-")
    if image_id in seen_ids:
        problems.append(f"two assets have the id {image_id}")
    seen_ids.add(image_id)

    group_id = slug(asset.get("group") or family, "other")
    group = groups.setdefault(group_id, {"id": group_id, "title": family, "jobs": {}})
    style = styles.get(family) or styles.get(group_id) or default_style
    if style:
        group["style"] = style
    job_id = slug(folder or "art", "art")
    job = group["jobs"].setdefault(job_id, {"id": job_id, "title": f"{family}: {folder or 'art'}", "dir": folder or "art", "images": []})
    shown = asset.get("name") or stem
    image = {"id": image_id, "name": shown, "file": stem, "prompt": asset["prompt"].strip()}
    if kind == "image":
        image["sizes"] = sizes_for(asset)
        text = draft_text(asset, kind, shown)
        if text:
            image["alt"] = text
    else:
        image["kind"] = kind
        fmt = asset.get("format") or (extension if extension in SOUND_FORMATS else "mp3")
        if fmt not in SOUND_FORMATS:
            problems.append(f'{asset.get("id")}: sound format "{fmt}" is not one of {", ".join(SOUND_FORMATS)}')
            continue
        image["format"] = fmt
        for field in ("seconds", "loop", "voice"):
            if asset.get(field) not in (None, ""):
                image[field] = asset[field]
        image["caption"] = draft_text(asset, kind, shown)
    groups[group_id] = group
    job["images"].append(image)

if problems:
    print("Not written. Fix these in prompts.json first:")
    for p in problems:
        print("  - " + p)
    sys.exit(1)

catalogue = {
    "version": 1,
    "project": data.get("project", ""),
    "note": f"Generated by Asset Forge's build_catalogue.py from {src.as_posix()}. Do not edit by hand: change prompts.json and rebuild.",
    "sizes": factory.get("sizes", {}),
    "groups": [{**{k: v for k, v in g.items() if k != "jobs"}, "jobs": list(g["jobs"].values())} for g in groups.values()],
}
if factory.get("root"):
    catalogue["root"] = factory["root"]
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(catalogue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
items = [i for g in catalogue["groups"] for j in g["jobs"] for i in j["images"]]
sounds = sum(1 for i in items if i.get("kind", "image") != "image")
drafted = sum(1 for i in items if i.get("alt") or i.get("caption"))
print(f"Wrote {out}: {len(items) - sounds} pictures and {sounds} sounds in {len(catalogue['groups'])} groups ({skipped} done or skipped left out). "
      f"Alt text or captions on {drafted} of {len(items)}: drafts, for Max to check in review.")
