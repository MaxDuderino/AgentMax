"""Merges prompt fixes exported from Content Factory MAX into the project's own prompts.json.

Usage:  python merge_fixes.py <project>/assets/prompts.json <prompt-fixes.json> [--dry-run] [--force]

In the factory, Max edits words, alt text and style blocks as he reviews. Those
edits live in the project's Redis until he presses "Export prompt fixes".
This puts them into prompts.json, the one source of truth, as **numbered
versions**: the old words are kept in the asset's "history", so nothing is
ever lost. Then rebuild the catalogue with build_catalogue.py.

  "Saved to that project's own art list, versioned. Never AgentMax or the
   template." "i dont want it changing my template base image with a change
   from boogermax.com" (Max, 2026-10-16)

So it refuses to write into AgentMax or MaxTemplateWithAgents.

  - A fix whose asset changed in prompts.json since the export (both sides
    edited) is a conflict: listed and skipped, unless --force.
  - --dry-run says what would change and writes nothing.
"""
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if len(args) != 2 or "-h" in sys.argv or "--help" in sys.argv:
    print(__doc__)
    sys.exit(0 if ("-h" in sys.argv or "--help" in sys.argv) else 2)
DRY = "--dry-run" in sys.argv
FORCE = "--force" in sys.argv
prompts_path, fixes_path = Path(args[0]).resolve(), Path(args[1])


def protected(path):
    """Why this file must not be changed (AgentMax or the template), or None."""
    for folder in [path.parent, *path.parents]:
        if (folder / "tools" / "build.py").exists() and (folder / "starter" / "kits").exists():
            return f"{folder} is AgentMax, the lineup itself"
        if (folder / ".git").exists():
            try:
                remote = subprocess.run(["git", "-C", str(folder), "remote", "get-url", "origin"], capture_output=True, text=True, timeout=10).stdout
            except (OSError, subprocess.SubprocessError):
                remote = ""
            if "maxtemplatewithagents" in remote.lower():
                return f"{folder} is the MaxTemplateWithAgents template"
            return None
    return None


why = protected(prompts_path)
if why:
    print(f"Not merged: {why}. Prompt fixes belong in the project's own prompts.json, never the template (Max, 2026-10-16).")
    sys.exit(1)

data = json.loads(prompts_path.read_text(encoding="utf-8"))
fixes = json.loads(fixes_path.read_text(encoding="utf-8"))
if fixes.get("kind") != "content-factory-prompt-fixes":
    print(f"{fixes_path} is not a Content Factory MAX prompt-fixes export.")
    sys.exit(2)
when = fixes.get("exportedAt") or datetime.now(timezone.utc).isoformat()
def catalogue_id(raw):
    """The id build_catalogue.py gives an asset in the factory (it swaps anything but letters, digits, - and _ for -)."""
    return re.sub(r"[^A-Za-z0-9_-]+", "-", str(raw)).strip("-")


# Found by the id the factory exported (the catalogue's form), whatever the asset's id looks like in prompts.json.
assets = {}
for a in data.get("assets", []):
    key = catalogue_id(a.get("id") or Path(str(a.get("file") or "")).stem)
    if key in assets:
        print(f"Not merged: two assets in prompts.json both become the id {key} in the factory. Give one a different id first.")
        sys.exit(1)
    assets[key] = a


def new_version(asset, field, value, note):
    """Keeps the old value as a numbered version, then sets the new one."""
    history = asset.setdefault("history", [])
    version = int(asset.get("version", 1))
    history.append({"v": version, field: asset.get(field, ""), "replaced": when, "why": note})
    asset["version"] = version + 1
    asset[field] = value


def conflicted(current, original, new):
    """Both sides changed it: prompts.json no longer says what it said when the edit was made, nor the new words."""
    return current is not None and current.strip() not in (original.strip(), new.strip()) and not FORCE


changed, same, conflicts, missing = [], 0, [], []
for fix in fixes.get("fixes", []):
    asset = assets.get(catalogue_id(fix.get("assetId", "")))
    if asset is None:
        missing.append(fix.get("id"))
        continue
    current = asset.get("prompt", "")
    if current.strip() == fix["prompt"].strip():
        same += 1
        continue
    if conflicted(current, fix.get("original", ""), fix["prompt"]):
        conflicts.append(fix["id"])
        continue
    new_version(asset, "prompt", fix["prompt"].strip(), "edited in Content Factory MAX")
    changed.append(f'{asset["id"]}: words, now version {asset["version"]}')

for text in fixes.get("texts", []):
    asset = assets.get(catalogue_id(text.get("assetId", "")))
    field = text.get("field") if text.get("field") in ("alt", "caption") else "alt"
    if asset is None:
        missing.append(text.get("id"))
        continue
    # An asset with no alt or caption of its own had a draft from build_catalogue.py: nothing on this side to clash with.
    current = asset.get(field)
    if (current or "").strip() == text["text"].strip():
        same += 1
        continue
    if conflicted(current, text.get("original", ""), text["text"]):
        conflicts.append(f'{text["id"]} ({field})')
        continue
    new_version(asset, field, text["text"].strip(), f"{field} edited in review")
    changed.append(f'{asset["id"]}: {field}, now version {asset["version"]}')

factory = data.setdefault("factory", {})
styles = factory.setdefault("styles", {})
exported_styles = fixes.get("styles") or []
if isinstance(exported_styles, dict):  # an export from before baselines were kept: no original, so any difference is a conflict
    exported_styles = [{"family": family, "text": text, "original": None} for family, text in exported_styles.items()]
for style in exported_styles:
    family, text = style["family"], style["text"]
    current = styles.get(family)
    if (current or "").strip() == text.strip():
        same += 1
        continue
    # No style of its own in prompts.json means the group used STYLE.md's: nothing on this side to clash with.
    if current is not None and style.get("original") is None and not FORCE or conflicted(current, style.get("original") or "", text):
        conflicts.append(f"style block for {family}")
        continue
    old = factory.setdefault("styleHistory", {}).setdefault(family, [])
    old.append({"v": len(old) + 1, "style": current or "", "replaced": when})
    styles[family] = text.strip()
    changed.append(f"style block for {family}, now version {len(old) + 1}")

for line in changed:
    print(("Would change  " if DRY else "Changed  ") + line)
if conflicts:
    print(f"Skipped {len(conflicts)} where prompts.json changed since the edit was made too (both sides edited): {', '.join(conflicts)}. Check them by hand, or run again with --force to take the factory's.")
if missing:
    print(f"{len(missing)} are not in prompts.json (computed or batch items, or removed): {', '.join(str(m) for m in missing)}.")
print(f"{len(changed)} change(s), {same} already the same.")
if changed and not DRY:
    prompts_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {prompts_path}. Now rebuild the catalogue: python build_catalogue.py {args[0]} <project>/art/art-catalogue.json")
