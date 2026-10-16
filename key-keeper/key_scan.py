"""Key Keeper's secret scanner. Stops API keys, tokens and passwords from landing in a repo.

Usage (run inside a project repo):
  python key_scan.py --staged         scan files staged for the next commit (what the hook runs)
  python key_scan.py --all            scan every tracked file
  python key_scan.py --install-hook   scan automatically before every commit in this repo
  python key_scan.py --help           show this message

A finding blocks the commit. To keep a line that's a known false alarm, add
"keykeeper:ignore" to that line.

The hook only protects commits made on this computer. Commits made from GPT,
Gemini or the GitHub website skip it, so also turn on GitHub's secret scanning
and push protection for every public repo (see SKILL.md).
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

PATTERNS = [
    ("Anthropic API key", r"sk-ant-[A-Za-z0-9_\-]{20,}"),
    ("OpenAI API key", r"sk-(?:proj-|svcacct-)?[A-Za-z0-9_\-]{20,}"),
    ("Google API key", r"AIza[0-9A-Za-z_\-]{35}"),
    ("Google OAuth client secret", r"GOCSPX-[0-9A-Za-z_\-]{20,}"),
    ("GitHub token", r"gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}"),
    ("Hugging Face token", r"hf_[A-Za-z0-9]{30,}"),
    ("AWS access key", r"(?:AKIA|ASIA)[0-9A-Z]{16}"),
    ("Stripe secret key", r"(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{20,}"),
    ("Slack token", r"xox[baprs]-[0-9A-Za-z\-]{10,}"),
    ("Vercel token", r"vercel_[A-Za-z0-9]{20,}"),
    ("JWT (e.g. a Supabase service key)", r"eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"),
    ("Private key", r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----"),
    ("Database URL with password", r"(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|rediss)://[^:\s/]+:[^@\s]{3,}@"),
    # Any name containing key/secret/token/password, in any case style: apiKey, API_KEY, OPENAI_API_KEY, db-password ...
    ("Hard-coded secret",
     r"(?i)[A-Za-z0-9_\-]*(?:api[_\-]?key|secret|token|passw(?:or)?d|pwd|auth)[A-Za-z0-9_\-]*[\"']?\s*[:=]\s*[\"']"
     r"(?!\$\{|process\.env|os\.environ|<|your[_\-]|xxx|changeme|example)[^\"'\s]{12,}[\"']"),
]
RISKY_FILES = re.compile(
    r"(^|/)(\.env(\.[\w.-]+)?|\.envrc|\.npmrc|\.pypirc|id_rsa|id_ed25519|id_ecdsa|[^/]*\.pem|[^/]*\.p12|[^/]*\.pfx|[^/]*\.key"
    r"|credentials(\.json)?|secrets?\.(json|ya?ml|toml)|service-account[^/]*\.json)$", re.I)
SAFE_ENV = re.compile(r"\.env\.(example|sample|template|defaults)$", re.I)
SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".woff", ".woff2", ".ttf",
            ".mp3", ".mp4", ".wav", ".lock", ".docx", ".xlsx", ".pptx"}


def git(*args, raw=False):
    out = subprocess.run(["git", "-c", "core.quotepath=false", *args], capture_output=True, check=True).stdout
    return out if raw else out.decode("utf-8", errors="replace")


def files(mode):
    if mode == "--staged":
        out = git("diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR", raw=True)
    else:
        out = git("ls-files", "-z", raw=True)
    return [f.decode("utf-8", errors="replace") for f in out.split(b"\0") if f]


def content(path, mode):
    if mode == "--staged":
        r = subprocess.run(["git", "show", f":{path}"], capture_output=True)
        return r.stdout.decode("utf-8", errors="ignore")
    return Path(path).read_text(encoding="utf-8", errors="ignore")


def install_hook():
    hooks = Path(git("rev-parse", "--git-path", "hooks").strip())
    hooks.mkdir(parents=True, exist_ok=True)
    # Copy the scanner into the repo's hook folder, so the hook keeps working if the skill folder moves.
    shutil.copy2(__file__, hooks / "key_scan.py")
    hook = hooks / "pre-commit"
    if hook.exists() and "key_scan.py" not in hook.read_text(errors="ignore"):
        backup = hooks / "pre-commit.before-keykeeper"
        shutil.copy2(hook, backup)
        print(f"Your existing pre-commit hook was saved as {backup.name} and still runs first.")
        first = f'"$(dirname "$0")/{backup.name}" "$@" || exit $?\n'
    else:
        first = ""
    hook.write_text(
        "#!/bin/sh\n"
        + first +
        'SCAN="$(dirname "$0")/key_scan.py"\n'
        'if [ ! -f "$SCAN" ]; then echo "Key Keeper: scanner missing from .git/hooks. Run key_scan.py --install-hook again."; exit 1; fi\n'
        # Run python3 rather than just finding it: on Windows, "python3" is a Store stub that exists but fails.
        'if python3 -c "" >/dev/null 2>&1; then PY=python3; else PY=python; fi\n'
        'exec "$PY" "$SCAN" --staged\n', encoding="utf-8")
    hook.chmod(0o755)
    print("Key Keeper hook installed. Every commit in this repo gets scanned now.")
    print("Commits made from GPT, Gemini or the GitHub website skip hooks: turn on GitHub push protection too.")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--staged"
    if mode in ("--help", "-h"):
        print(__doc__)
        return 0
    if mode == "--install-hook":
        return install_hook()
    if mode not in ("--staged", "--all"):
        print(__doc__)
        return 2
    found = []
    for f in files(mode):
        if Path(f).suffix.lower() in SKIP_EXT:
            continue
        if RISKY_FILES.search(f) and not SAFE_ENV.search(f):
            found.append((f, 0, "Secrets file", "this kind of file should not be committed"))
            continue
        for n, line in enumerate(content(f, mode).splitlines(), 1):
            if "keykeeper:ignore" in line:
                continue
            for label, pat in PATTERNS:
                m = re.search(pat, line)
                if m:
                    s = m.group(0)
                    found.append((f, n, label, s[:6] + "…" + s[-2:] if len(s) > 10 else "…"))
                    break
    if not found:
        print("Key Keeper: no secrets found.")
        return 0
    print("Key Keeper stopped this. Possible secrets:")
    for f, n, label, hint in found:
        print(f"  {f}{':' + str(n) if n else ''}  {label}  ({hint})")
    print("\nMove secrets into .env (and make sure .env is in .gitignore), or into Vercel environment variables.")
    print('False alarm? Add "keykeeper:ignore" to that line.')
    return 1


if __name__ == "__main__":
    sys.exit(main() or 0)
