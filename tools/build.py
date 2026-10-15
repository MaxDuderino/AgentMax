"""Builds the BVD persona files and the Claude Code subagent wrappers.

Sources (edit these, never the generated files):
  bvd/source/BVD_Personas_v4.4a.json   recovered v4.4a canon
  tools/personas_v45_additions.json    how each persona works in Max's projects

Outputs (regenerated every run):
  bvd/personas/NN-<slug>.md            portable persona files, any AI can read them
  claude-code/agents/bvd-<slug>.md     Claude Code subagent wrappers (persona embedded)
  qa-team/roles/henry.md               copy of Henry for the QA Team skill
  claude-code/agents/qa-*.md           QA Team role subagents
  focus-group/testers/NN-<slug>.md     Focus Group tester files (from focus-group/testers.json)
  claude-code/agents/fg-*.md           Focus Group tester subagents

Run:  python tools/build.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
canon = json.loads((ROOT / "bvd/source/BVD_Personas_v4.4a.json").read_text(encoding="utf-8"))
extra = json.loads((ROOT / "tools/personas_v45_additions.json").read_text(encoding="utf-8"))

NOT_CANON = ("No ", "No uniquely", "No reliable", "No recovered", "No securely")


def bullets(items):
    return "\n".join(f"- {i}" for i in items)


def persona_md(m, x):
    num = m["id"].split("-")[1]
    q = m.get("quote", "")
    if q.startswith(NOT_CANON):
        quote = "_No canon catchphrase recovered yet. Don't invent one and call it canon; if Max likes a line, add it here._"
    else:
        quote = f"> {q}"
        if m.get("alternate_quotes"):
            quote += "\n\nEarlier versions: " + " · ".join(f"“{a}”" for a in m["alternate_quotes"])
    return f"""# BVD-{num} · {m['name']}
**{m['role']}**
_{m['tagline']}_ · BVD personas v4.5-draft (built on v4.4a canon)

{quote}

## Who they are (canon, recovered from past BVD sessions)
{bullets(m['canon'])}

## What they care about
{m['mission']}

## How they talk
{m['voice']}

## How they steer a project
{x['steers']}

## How they disagree
{x['disagrees']}

## What they flag
{x['flags']}

Hard line from canon: {m['redline']}

## In Max's projects
{x['in_maxs_world']}

## First moves
{bullets(m['instincts'])}

## Questions they always ask
{bullets(m['asks'])}

## What they hand back
{bullets(m['outputs'])}

## Strengths
{m['strengths']}

## Blind spots
{m['blindspots']}

## Who they lean on
{m['peers']}

## Sample line (illustrative, not canon)
{m['example']}

## Look (proposal, not canon)
{m['art']}
"""


def wrapper_md(m, x, body):
    slug = x["slug"]
    return f"""---
name: bvd-{slug}
description: BVD council seat {m['id']}, {m['name']} ({m['role']}). Use when the BVD conductor runs a Full Council, or when Max asks for {m['name'].split()[0]} by name.
tools: Read, Grep, Glob
model: inherit
---
You are {m['name']}, one seat on the BullKoch Variant Division (BVD), the 11-persona review council for Max (The Dude). You are reviewing cold, in your own context, so your view is genuinely yours. Do not guess what the other ten think.

Max is the final authority. The council is advisory: give your honest view, but never claim to block anything. Never claim you ran, tested or verified something unless you actually did it with a tool in this session.

Return, in your own voice, under 300 words:
1. Your position in one line (for / against / for-with-changes).
2. Your top concerns, most important first.
3. Anything you'd flag as a real blocker, and the cheapest safe way through it.
4. The smallest next step you'd take.
5. What you could not check.

Your persona file follows.

{body}"""


ids = []
for m in canon["members"]:
    x = extra[m["id"]]
    num = m["id"].split("-")[1]
    body = persona_md(m, x)
    (ROOT / f"bvd/personas/{num}-{x['slug']}.md").write_text(body, encoding="utf-8")
    (ROOT / f"claude-code/agents/bvd-{x['slug']}.md").write_text(wrapper_md(m, x, body), encoding="utf-8")
    ids.append(f"{num}-{x['slug']}")

print("built", len(ids), "BVD personas:", ", ".join(ids))

# ---------------------------------------------------------------- QA Team
# Henry leads the QA Team, so his persona ships inside that skill too.
henry = next(p for p in (ROOT / "bvd/personas").glob("05-*.md"))
(ROOT / "qa-team/roles/henry.md").write_text(henry.read_text(encoding="utf-8"), encoding="utf-8")

QA_WRAP = """---
name: qa-{slug}
description: QA Team role, {title}. Use when the QA Team conductor runs this role, or when Max asks for the {title} directly.
model: inherit
---
You are the {title} on Max's QA Team, led by Henry. Work only from evidence you gather in this session: browser clicks, screenshots, console output, logs. If you could not check something, say so. Never write "passed", "verified" or "reproduced" without evidence.

Return your findings in the format your role file asks for, then a short list of what you could not check.

Your role file follows.

{body}"""

qa = []
for role in sorted((ROOT / "qa-team/roles").glob("*.md")):
    if role.stem == "henry":
        continue
    body = role.read_text(encoding="utf-8")
    title = body.splitlines()[0].lstrip("# ").strip()
    (ROOT / f"claude-code/agents/qa-{role.stem}.md").write_text(
        QA_WRAP.format(slug=role.stem, title=title, body=body), encoding="utf-8")
    qa.append(role.stem)
print("built", len(qa), "QA roles:", ", ".join(qa))

# ------------------------------------------------------------ Focus Group
fg = json.loads((ROOT / "focus-group/testers.json").read_text(encoding="utf-8"))
(ROOT / "focus-group/testers").mkdir(exist_ok=True)

TESTER = """# {name} · {seat}
_Focus Group tester. Generic for any app or game: fill in {{THING}} and {{HOST}} for the project._

**Who:** {who}

| | |
|---|---|
| Tech comfort | {tech} |
| Patience | {patience} |
| First move | {first_move} |

## Delighted by
{delights}

## Quits when
{quits}

## Finds
{finds}

## How they talk
{voice}

## How they test
- Play it as {name} would, not as a QA engineer. Stay in character.
- Use a browser on the live site if one is available. If not, say you only read about it.
- Note the exact screen and step for every stumble.
- Say whether you'd come back: yes, maybe or no, and why.

_Origin: {origin} Name is a placeholder: rename freely._
"""

FG_WRAP = """---
name: fg-{slug}
description: Focus Group tester {name}, {seat}. Use when the Focus Group conductor runs a Full Playtest, or when Max asks for {name} by name.
model: inherit
---
You are {name}, one tester in Max's Focus Group. You test in your own context, so your reactions are your own. Play the build the way {name} really would.

The brief tells you what {{THING}} and {{HOST}} mean for this project. If it doesn't, ask.

Return, in {name}'s voice, under 300 words: what you understood in the first minute, what you loved, exactly where you got stuck or quit, the feature you wish it had, and whether you'd come back (yes / maybe / no). Then list anything you couldn't actually try.

Your tester file follows.

{body}"""

for i, t in enumerate(fg["testers"], 1):
    body = TESTER.format(**t)
    (ROOT / f"focus-group/testers/{i:02d}-{t['slug']}.md").write_text(body, encoding="utf-8")
    (ROOT / f"claude-code/agents/fg-{t['slug']}.md").write_text(
        FG_WRAP.format(slug=t["slug"], name=t["name"], seat=t["seat"], body=body), encoding="utf-8")
print("built", len(fg["testers"]), "Focus Group testers:", ", ".join(t["name"] for t in fg["testers"]))

# ------------------------------------------------- Skill zips for Claude chat
# One zip per skill folder, ready to upload as a skill in Claude chat.
import zipfile

dist = ROOT / "dist"
dist.mkdir(exist_ok=True)
zips = []
for d in sorted(p for p in ROOT.iterdir() if (p / "SKILL.md").exists()):
    zp = dist / f"{d.name}.zip"
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(d.rglob("*")):
            if f.is_file() and f.suffix != ".docx" and "__pycache__" not in f.parts:
                z.write(f, f.relative_to(ROOT).as_posix())
    zips.append(d.name)
print("zipped", len(zips), "skills into dist/:", ", ".join(zips))
