#!/usr/bin/env python3
"""PreToolUse guard for the VK night agent. Exit 2 blocks the call and tells Claude why."""
import json, re, sys

d = json.load(sys.stdin)
tool = d.get("tool_name", "")
inp = d.get("tool_input", {}) or {}
cmd = inp.get("command", "") or ""
path = inp.get("file_path", "") or ""

BLOCK_CMD = [
    (r"git\s+push\b.*\b(main|master|develop|feat/launch-ready-v3)\b", "push to protected branch"),
    (r"git\s+push\b.*(--force|\s-f\b)", "force push"),
    (r"/pulls/\d+/merge", "merging PRs is owner-only"),
    (r"/actions/workflows/.*/dispatches|gh\s+workflow\s+run", "triggering workflows is owner-only"),
    (r"\bvercel\b", "deploys are owner-only"),
    (r"\bpsql\b|postgres(ql)?://|\.supabase\.co/rest|/auth/v1/", "live database / auth access"),
    (r"(midtrans|xendit|biteship).*(live|production)", "live payment/shipping"),
    (r"rm\s+-rf\s+(/|~|\.\s*$)", "destructive delete"),
    (r"(cat|less|head|tail|cp|curl|grep)\b.*\.env(?!\.example)\b", "secret file access"),
]
if tool == "Bash":
    for pat, why in BLOCK_CMD:
        if re.search(pat, cmd, re.IGNORECASE):
            print(f"BLOCKED by guard: {why}. Write a Decision Packet instead.", file=sys.stderr)
            sys.exit(2)
if tool in ("Read", "Edit", "Write") and re.search(r"(^|/)\.env(\.(?!example)[^/]*)?$|/secrets/", path):
    print("BLOCKED by guard: secret file.", file=sys.stderr)
    sys.exit(2)
sys.exit(0)
