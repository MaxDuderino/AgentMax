"""Key Keeper's secret scanner. Stops API keys, tokens and passwords from landing in a repo.

Usage (run inside a project repo):
  python key_scan.py --staged         scan files staged for the next commit (what the hook runs)
  python key_scan.py --all            scan every tracked file
  python key_scan.py --install-hook   run --staged automatically before every commit

A finding blocks the commit. To keep a line that's a known false alarm, add
"keykeeper:ignore" to that line.
"""
import re
import subprocess
import sys
from pathlib import Path

PATTERNS = [
    ("Anthropic API key", r"sk-ant-[A-Za-z0-9_\-]{20,}"),
    ("OpenAI API key", r"sk-(?:proj-)?[A-Za-z0-9_\-]{20,}"),
    ("Google API key", r"AIza[0-9A-Za-z_\-]{35}"),
    ("GitHub token", r"gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}"),
    ("AWS access key", r"AKIA[0-9A-Z]{16}"),
    ("Stripe secret key", r"sk_live_[0-9A-Za-z]{20,}"),
    ("Slack token", r"xox[baprs]-[0-9A-Za-z\-]{10,}"),
    ("Vercel token", r"vercel_[A-Za-z0-9]{20,}"),
    ("Private key", r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    ("Database URL with password", r"(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis)://[^:\s/]+:[^@\s]{3,}@"),
    ("Hard-coded secret", r"(?i)\b(?:api[_-]?key|secret|password|passwd|token|auth[_-]?token)\b\s*[:=]\s*[\"'][^\"'\s]{12,}[\"']"),
]
RISKY_FILES = re.compile(r"(^|/)(\.env(\.[\w.-]+)?|id_rsa|id_ed25519|.*\.pem|.*\.p12|credentials\.json|service-account.*\.json)$")
SAFE_ENV = re.compile(r"\.env\.(example|sample|template)$")
SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".woff", ".woff2", ".ttf", ".mp3", ".mp4", ".lock"}


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def files(mode):
    if mode == "--staged":
        out = git("diff", "--cached", "--name-only", "--diff-filter=ACM")
    else:
        out = git("ls-files")
    return [f for f in out.splitlines() if f]


def content(path, mode):
    if mode == "--staged":
        return subprocess.run(["git", "show", f":{path}"], capture_output=True, text=True, errors="ignore").stdout
    return Path(path).read_text(encoding="utf-8", errors="ignore")


def install_hook():
    hook = Path(git("rev-parse", "--git-path", "hooks").strip()) / "pre-commit"
    script = Path(__file__).resolve().as_posix()
    hook.write_text(
        "#!/bin/sh\n"
        "if command -v python3 >/dev/null 2>&1; then PY=python3; else PY=python; fi\n"
        f'exec "$PY" "{script}" --staged\n', encoding="utf-8")
    hook.chmod(0o755)
    print(f"Key Keeper hook installed at {hook}. Every commit gets scanned now.")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--staged"
    if mode == "--install-hook":
        return install_hook()
    found = []
    for f in files(mode):
        if Path(f).suffix.lower() in SKIP_EXT:
            continue
        if RISKY_FILES.search(f) and not SAFE_ENV.search(f):
            found.append((f, 0, "Secrets file", "this whole file type should not be committed"))
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
