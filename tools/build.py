"""Builds everything generated in the Agent Lineup.

Usage:
  python tools/build.py           regenerate every generated file
  python tools/build.py --check   change nothing; list generated files that are out of date (exit 1 if any)
  python tools/build.py --help    show this message

Sources (edit these, never the generated files):
  RULES.md                             the rule ledger (master copy)
  bvd/source/BVD_Personas_v4.4a.json   recovered v4.4a canon
  tools/personas_v45_additions.json    how each persona works in Max's projects
  focus-group/testers.json             the Focus Group crew
  qa-team/roles/*.md                   QA Team roles (except henry.md, which is generated)
  <skill>/SKILL.md                     every skill folder

Generated:
  bvd/personas/NN-<slug>.md            portable persona files
  focus-group/testers/NN-<slug>.md     portable tester files
  qa-team/roles/henry.md               Henry's persona, shipped with the QA Team
  <skill>/RULES.md                     a copy of the rule ledger inside every skill, so the rules travel
  claude-code/agents/*.md              Claude Code subagents (bvd-*, fg-*, qa-*)
  dist/<skill>.zip                     one zip per skill for Claude chat (same bytes every build)
  dist/for-gpt-gemini/                 the paste-in kit for GPT, Gemini, AI Studio and other tools
  starter/CLAUDE.md, AGENTS.md, VISION.md   the template's generated files (the rest of starter/ is source)
"""
import io
import json
import sys
import zipfile
from pathlib import Path

if "--help" in sys.argv or "-h" in sys.argv:
    print(__doc__)
    sys.exit(0)
CHECK = "--check" in sys.argv

ROOT = Path(__file__).resolve().parent.parent
OUT: dict[str, bytes] = {}          # relative path -> generated content


def emit(rel, text):
    OUT[rel] = text.encode("utf-8") if isinstance(text, str) else text


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def strip_frontmatter(text):
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[end + 4:].lstrip("\n")
    return text


def frontmatter_field(text, field):
    for line in text.splitlines()[1:]:
        if line.startswith("---"):
            break
        if line.startswith(field + ":"):
            return line.split(":", 1)[1].strip()
    return ""


def bullets(items):
    return "\n".join(f"- {i}" for i in items)


# --------------------------------------------------------------------- BVD
canon = json.loads(read("bvd/source/BVD_Personas_v4.4a.json"))
extra = json.loads(read("tools/personas_v45_additions.json"))
NOT_CANON = ("No ", "No uniquely", "No reliable", "No recovered", "No securely")


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
_{m['tagline']}_ · BVD personas v4.5 (approved by Max 2026-10-15, built on v4.4a canon)

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


BVD_WRAP = """---
name: bvd-{slug}
description: BVD council seat {id}, {name} ({role}). Use when the BVD conductor runs a Full Council, or when Max asks for {first} by name.
tools: Read, Grep, Glob
model: inherit
---
You are {name}, one seat on the BullKoch Variant Division (BVD), the 11-persona review council for Max (The Dude). You are reviewing cold, in your own context, so your view is genuinely yours. Do not guess what the other ten think.

Max is the final authority. The council is advisory: give your honest view, but never claim to block anything. Never claim you ran, tested or verified something unless you actually did it with a tool in this session. Never change files: you review, the conductor builds.

Return, in your own voice, under 400 words:
1. Verdict: APPROVE / APPROVE WITH CHANGES / REWORK, and your position in one line.
2. Your top concerns, most important first.
3. Up to 3 improvement proposals, ranked, each naming what to change.
4. Anything you'd flag as a real blocker, and the cheapest safe way through it.
5. What you could not check.

Your persona file follows.

{body}"""

personas = []
for m in canon["members"]:
    x = extra[m["id"]]
    num = m["id"].split("-")[1]
    body = persona_md(m, x)
    personas.append(body)
    emit(f"bvd/personas/{num}-{x['slug']}.md", body)
    emit(f"claude-code/agents/bvd-{x['slug']}.md", BVD_WRAP.format(
        slug=x["slug"], id=m["id"], name=m["name"], role=m["role"], first=m["name"].split()[0], body=body))
henry_body = next(p for p, m in zip(personas, canon["members"]) if m["id"] == "BVD-05")
emit("qa-team/roles/henry.md", henry_body)

# ----------------------------------------------------------------- QA Team
QA_DENY = {
    # Nobody on the QA Team edits files. Bug Wrangler and the audit draft; the lead files issues on Max's go.
    "smoke-tester": "Write, Edit, NotebookEdit, mcp__github",
    "bug-wrangler": "Write, Edit, NotebookEdit, mcp__github",
    "hollow-audit": "Write, Edit, NotebookEdit, mcp__github",
}
QA_WRAP = """---
name: qa-{slug}
description: QA Team role, {title}. Use when the QA Team conductor runs this role, or when Max asks for the {title} directly.
disallowedTools: {deny}
model: inherit
---
You are the {title} on Max's QA Team, led by Henry. Work only from evidence you gather in this session: browser clicks, keyboard passes, screenshots, console output, logs. If you could not check something, say so. Never write "passed", "verified" or "reproduced" without evidence. You report; you don't edit files or file issues. The lead does that on Max's go.

Return your findings in the format your role file asks for, then a short list of what you could not check, and any test data you created.

Your role file follows.

{body}"""

qa_roles = []
for role in sorted((ROOT / "qa-team/roles").glob("*.md")):
    if role.stem == "henry":
        continue
    body = role.read_text(encoding="utf-8")
    title = body.splitlines()[0].lstrip("# ").strip()
    qa_roles.append(body)
    emit(f"claude-code/agents/qa-{role.stem}.md", QA_WRAP.format(
        slug=role.stem, title=title, deny=QA_DENY.get(role.stem, "Write, Edit, NotebookEdit, mcp__github"), body=body))

# ------------------------------------------------------------- Focus Group
fg = json.loads(read("focus-group/testers.json"))
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
disallowedTools: Write, Edit, NotebookEdit, Bash, mcp__github
model: inherit
---
You are {name}, one tester in Max's Focus Group. You test in your own context, so your reactions are your own. Play the build the way {name} really would. You play and report; you never change files.

The brief tells you what {{THING}} and {{HOST}} mean for this project. If it doesn't, ask.

Return, in {name}'s voice, under 300 words: what you understood in the first minute, what you loved, exactly where you got stuck or quit, the feature you wish it had, and whether you'd come back (yes / maybe / no). Then list anything you couldn't actually try, and any test data you created.

Your tester file follows.

{body}"""

testers = []
for i, t in enumerate(fg["testers"], 1):
    body = TESTER.format(**t)
    testers.append(body)
    emit(f"focus-group/testers/{i:02d}-{t['slug']}.md", body)
    emit(f"claude-code/agents/fg-{t['slug']}.md", FG_WRAP.format(
        slug=t["slug"], name=t["name"], seat=t["seat"], body=body))

# ------------------------------------------------- Rules travel with skills
rules = read("RULES.md")
skills = sorted(p for p in ROOT.iterdir() if (p / "SKILL.md").exists())
rules_copy = ("<!-- Copy of the Agent Lineup rule ledger, shipped inside this skill so the rules travel with it. "
              "Edit the master RULES.md at the root of the AgentMax repo, then run tools/build.py. -->\n\n" + rules)
for d in skills:
    emit(f"{d.name}/RULES.md", rules_copy)

# ------------------------------------------------ Paste-in kit for other AIs
ORDER = ["session-kickoff", "wrap", "bvd", "vision-keeper", "checkpoint", "key-keeper", "translator", "scribe",
         "qa-team", "focus-group", "deploy-doctor", "asset-forge", "handoff-packer"]
names = [d.name for d in skills]
ordered = [n for n in ORDER if n in names] + [n for n in names if n not in ORDER]

parts = ["# AgentMax · The Agent Lineup, all in one file\n",
         "_Generated by tools/build.py from github.com/MaxDuderino/AgentMax. Upload this as a knowledge file "
         "(ChatGPT project or custom GPT, a Gemini Gem, AI Studio, or any tool that takes files). "
         "Paste INSTRUCTIONS.txt into the tool's instructions box._\n",
         "## How to use this file\n",
         "Each agent below is a section. When Max asks for an agent by name or describes its job, find its section and follow it. "
         "Slash commands like `/bvd` are Claude shortcuts: anywhere else, treat them as the agent's name.\n",
         "## Contents\n" + "\n".join(f"- Agent: {n}" for n in ordered) +
         "\n- BVD persona files (11)\n- Focus Group tester files\n- QA Team role files\n- House rules\n",
         "\n---\n\n# House rules\n\n" + rules]
for n in ordered:
    text = read(f"{n}/SKILL.md")
    parts.append(f"\n---\n\n# Agent: {n}\n\n_When to use:_ {frontmatter_field(text, 'description')}\n\n"
                 + strip_frontmatter(text))
parts.append("\n---\n\n# BVD persona files\n\n" + "\n\n---\n\n".join(personas))
parts.append("\n---\n\n# Focus Group tester files\n\n" + "\n\n---\n\n".join(testers))
parts.append("\n---\n\n# QA Team role files\n\n" + "\n\n---\n\n".join(qa_roles))
parts.append("\n---\n\n# Command cheat sheet\n\n" + strip_frontmatter(read("COMMANDS.md")).split("\n",1)[1])
emit("dist/for-gpt-gemini/AGENTMAX-ALL.md", "\n".join(parts))
emit("dist/for-gpt-gemini/INSTRUCTIONS.txt", read("snippets/INSTRUCTIONS.txt"))

# ---------------------------------------- Starter kit (MaxTemplateWithAgents)
# Built from the same snippets the lineup uses, so the template never drifts.
# To refresh the template repo, copy starter/ into MaxTemplateWithAgents.
emit("starter/CLAUDE.md",
     "# <Project name>\n\n## About this project\n"
     "_What it is, who it's for, and what \"done\" means live in VISION.md. Vision Keeper writes it with Max on day one._\n\n"
     + read("snippets/CLAUDE-AGENTS.md"))
emit("starter/AGENTS.md", read("snippets/AGENTS.md"))
emit("starter/VISION.md", read("vision-keeper/templates/VISION.md"))

# ------------------------------------------------- Skill zips (deterministic)
def zip_bytes(folder, overrides):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        files = {f.relative_to(ROOT).as_posix(): f for f in folder.rglob("*")
                 if f.is_file() and f.suffix != ".docx" and "__pycache__" not in f.parts}
        for rel in overrides:
            if rel.startswith(folder.name + "/"):
                files[rel] = None
        for rel in sorted(files):
            data = overrides.get(rel)
            if data is None:
                data = files[rel].read_bytes()
            info = zipfile.ZipInfo(rel, date_time=(1980, 1, 1, 0, 0, 0))
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    return buf.getvalue()


for d in skills:
    emit(f"dist/{d.name}.zip", zip_bytes(d, OUT))

# ------------------------------------------------------------ write / check
stale = [rel for rel, data in sorted(OUT.items())
         if not (ROOT / rel).exists() or (ROOT / rel).read_bytes() != data]
if CHECK:
    if stale:
        print(f"{len(stale)} generated file(s) out of date. Run: python tools/build.py")
        for rel in stale:
            print("  " + rel)
        sys.exit(1)
    print(f"All {len(OUT)} generated files are up to date.")
    sys.exit(0)

for rel in stale:
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(OUT[rel])
print(f"Built {len(canon['members'])} BVD seats, {len(testers)} testers, {len(qa_roles)} QA roles, "
      f"{len(skills)} skills. {len(stale)} file(s) changed, {len(OUT) - len(stale)} already up to date.")
