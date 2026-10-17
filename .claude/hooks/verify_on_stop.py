#!/usr/bin/env python3
"""Stop hook: keep the agent working while verification fails (exit 2). Skips when nothing changed."""
import json, os, subprocess, sys

data = json.load(sys.stdin)
if data.get("stop_hook_active"):
    sys.exit(0)
root = os.environ.get("CLAUDE_PROJECT_DIR", ".")
branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=root, capture_output=True, text=True).stdout.strip()
if not branch.startswith("claude/vk-"):
    sys.exit(0)  # only enforce on agent work branches
base = subprocess.run(["git", "diff", "--quiet", "origin/develop...HEAD"], cwd=root)
dirty = subprocess.run(["git", "diff", "--quiet"], cwd=root)
if base.returncode == 0 and dirty.returncode == 0:
    sys.exit(0)
r = subprocess.run(["bash", "scripts/verify.sh"], cwd=root, capture_output=True, text=True, timeout=840)
if r.returncode != 0:
    tail = "\n".join((r.stdout + r.stderr).splitlines()[-40:])
    print("VERIFY FAILED — fix before finishing. Last 40 lines:\n" + tail, file=sys.stderr)
    sys.exit(2)
sys.exit(0)
