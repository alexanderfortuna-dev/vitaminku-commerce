#!/usr/bin/env bash
# Gabung semua migrasi (urutan resmi) jadi SATU file untuk ditempel di Supabase SQL Editor proyek BARU.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=supabase/arsip/ALL_MIGRATIONS_FOR_NEW_PROJECT.sql
{
  echo "-- Gabungan otomatis (jangan edit). Hanya untuk proyek Supabase BARU yang kosong."
  for f in $(ls supabase/arsip/migrasi-awal/*.sql | sort) $(ls drizzle/migrations/*.sql | sort); do
    echo; echo "-- ===== $f ====="; cat "$f"
  done
} > "$OUT"
echo "$OUT: $(wc -c < "$OUT") byte, $(grep -c '^-- ===== ' "$OUT") file"
