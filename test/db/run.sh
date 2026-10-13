#!/usr/bin/env bash
# Uji migrasi di Postgres 16 LOKAL (tidak pernah menyentuh Lovable maupun Supabase produksi).
# Pakai: sudo/root -> bash test/db/run.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN=/usr/lib/postgresql/16/bin
DATA=/tmp/vk-pgqa; SOCK=/tmp/vk-pgqa-sock; PORT=54330
rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"; chown postgres "$SOCK"
su postgres -c "$PGBIN/initdb -D $DATA -A trust >/dev/null"
su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k $SOCK -c listen_addresses=' -w -l /tmp/vk-pgqa.log start >/dev/null"
trap 'su postgres -c "$PGBIN/pg_ctl -D $DATA -m immediate stop >/dev/null" || true' EXIT
P="psql -h $SOCK -p $PORT -U postgres -d postgres -q -v ON_ERROR_STOP=1"
su postgres -c "$P -f $ROOT/test/db/00_supabase_stub.sql"
n=0
for f in "$ROOT/test/db/baseline_products.sql" $(ls "$ROOT"/supabase/migrations/*.sql | sort) $(ls "$ROOT"/drizzle/migrations/*.sql | sort); do
  su postgres -c "$P -f '$f'" >/dev/null || { echo "GAGAL migrasi: $f"; exit 1; }
  n=$((n+1))
done
echo "Migrasi diterapkan: $n file (urutan supabase/migrations lalu drizzle/migrations)"
su postgres -c "$P -f $ROOT/test/db/20_launch_assertions.sql"
