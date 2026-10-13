#!/usr/bin/env bash
# Sama dengan run.sh, tetapi menerapkan HANYA file gabungan (yang akan ditempel Kings di SQL Editor).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; bash "$ROOT/scripts/build-migration-bundle.sh" >/dev/null
sed -e 's#for f in .*; do#for f in "$ROOT"/supabase/ALL_MIGRATIONS_FOR_NEW_PROJECT.sql; do#' "$ROOT/test/db/run.sh" > /tmp/vk-run-bundle.sh
ROOT="$ROOT" bash -c 'export ROOT; sed -i "s#^ROOT=.*#ROOT=\"$ROOT\"#" /tmp/vk-run-bundle.sh; bash /tmp/vk-run-bundle.sh'
