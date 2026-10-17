#!/usr/bin/env bash
# Pemeriksaan lengkap VitaminKu (dipakai agen malam dan CI). Lint TIDAK jadi gerbang (masalah warisan).
set -euo pipefail
bun install --frozen-lockfile >/dev/null
bun run typecheck
bun run test
bun run build:vercel >/dev/null
echo "verify OK"
