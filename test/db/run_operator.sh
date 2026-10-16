#!/usr/bin/env bash
# Uji lokal file operator GitHub Actions (PASTE_SEKALI, VERIFY, BOOTSTRAP) di Postgres 16 LOKAL — tidak pernah produksi.
# Pakai: sudo/root -> bash test/db/run_operator.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN=/usr/lib/postgresql/16/bin
DATA=/tmp/vk-pgop; SOCK=/tmp/vk-pgop-sock; PORT=54331
rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"; chown postgres "$SOCK"
su postgres -c "$PGBIN/initdb -D $DATA -A trust >/dev/null"
su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k $SOCK -c listen_addresses=' -w -l /tmp/vk-pgop.log start >/dev/null"
trap 'su postgres -c "$PGBIN/pg_ctl -D $DATA -m immediate stop >/dev/null" || true' EXIT
P="psql -h $SOCK -p $PORT -U postgres -d postgres -q -v ON_ERROR_STOP=1"
run() { su postgres -c "$P $*"; }
run "-f $ROOT/test/db/00_supabase_stub.sql"
run "-c \"ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz\""
# Keadaan produksi: migrasi s/d 0009 sudah terpasang, 0010-0013 belum.
for f in "$ROOT/test/db/baseline_products.sql" $(ls "$ROOT"/supabase/migrations/*.sql | sort) $(ls "$ROOT"/drizzle/migrations/000*.sql | sort); do
  run "-f '$f'" >/dev/null
done
echo "== VERIFY sebelum migrate (harus GAGAL di 1-4) =="
run "-tA -F'|' -f $ROOT/supabase/VERIFY.sql"
echo "== migrate (satu transaksi) =="
run "--single-transaction -f $ROOT/supabase/PASTE_SEKALI.sql" >/dev/null && echo "migrate OK"
echo "== migrate ulang (idempoten) =="
run "--single-transaction -f $ROOT/supabase/PASTE_SEKALI.sql" >/dev/null && echo "migrate ulang OK"
run "-c \"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('00000000-0000-0000-0000-0000000000a1','alexander.fortuna@vitafortunajaya.com',now()),
 ('00000000-0000-0000-0000-0000000000a2','livita.gunardi@gmail.com',now()),
 ('00000000-0000-0000-0000-0000000000a3','gm@contoh.id',NULL)\""
echo "== bootstrap (admin_email belum verifikasi → dilewati) =="
run "--single-transaction -A -F' | ' -v kings_email=alexander.fortuna@vitafortunajaya.com -v livita_email=livita.gunardi@gmail.com -v admin_email=gm@contoh.id -f $ROOT/supabase/BOOTSTRAP_OWNER.sql"
echo "== bootstrap dengan variabel kosong =="
run "--single-transaction -A -v kings_email=alexander.fortuna@vitafortunajaya.com -v livita_email= -v admin_email= -f $ROOT/supabase/BOOTSTRAP_OWNER.sql" >/dev/null && echo "variabel kosong OK"
echo "== VERIFY sesudah =="
run "-tA -F'|' -f $ROOT/supabase/VERIFY.sql"
