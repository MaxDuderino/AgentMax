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
assets = {str(a.get("id")): a for a in data.get("assets", [])}


def new_version(asset, field, value, note):
    """Keeps the old value as a numbered version, then sets the new one."""
    history = asset.setdefault("history", [])
    version = int(asset.get("version", 1))
    history.append({"v": version, field: asset.get(field, ""), "replaced": when, "why": note})
    asset["version"] = version + 1
    asset[field] = value


changed, same, conflicts, missing = [], 0, [], []
for fix in fixes.get("fixes", []):
    asset = assets.get(str(fix.get("assetId")))
    if asset is None:
        missing.append(fix.get("id"))
        continue
    current = asset.get("prompt", "").strip()
    if current == fix["prompt"].strip():
        same += 1
        continue
    if current != fix.get("original", "").strip() and not FORCE:
        conflicts.append(fix["id"])
        continue
    new_version(asset, "prompt", fix["prompt"].strip(), "edited in Content Factory MAX")
    changed.append(f'{asset["id"]}: words, now version {asset["version"]}')

for text in fixes.get("texts", []):
    asset = assets.get(str(text.get("assetId")))
    field = text.get("field") if text.get("field") in ("alt", "caption") else "alt"
    if asset is None:
        missing.append(text.get("id"))
        continue
    if asset.get(field, "").strip() == text["text"].strip():
        same += 1
        continue
    new_version(asset, field, text["text"].strip(), f"{field} edited in review")
    changed.append(f'{asset["id"]}: {field}, now version {asset["version"]}')

factory = data.setdefault("factory", {})
styles = factory.setdefault("styles", {})
for family, text in (fixes.get("styles") or {}).items():
    if styles.get(family, "").strip() == text.strip():
        same += 1
        continue
    old = factory.setdefault("styleHistory", {}).setdefault(family, [])
    old.append({"v": len(old) + 1, "style": styles.get(family, ""), "replaced": when})
    styles[family] = text.strip()
    changed.append(f"style block for {family}, now version {len(old) + 1}")

for line in changed:
    print(("Would change  " if DRY else "Changed  ") + line)
if conflicts:
    print(f"Skipped {len(conflicts)} where prompts.json changed since the export too (both sides edited): {', '.join(conflicts)}. Check them by hand, or run again with --force to take the factory's words.")
if missing:
    print(f"{len(missing)} are not in prompts.json (computed or batch items, or removed): {', '.join(str(m) for m in missing)}.")
print(f"{len(changed)} change(s), {same} already the same.")
if changed and not DRY:
    prompts_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {prompts_path}. Now rebuild the catalogue: python build_catalogue.py {args[0]} <project>/art/art-catalogue.json")
