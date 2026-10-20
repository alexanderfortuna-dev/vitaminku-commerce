#!/usr/bin/env bash
# Uji asap situs publik VitaminKu (hanya membaca halaman; tidak login, tidak memesan).
# Pakai: SITE=https://vitaminku.vercel.app [SRK=<kunci service role>] [AK=<kunci AI>] bash scripts/uji-situs.sh
# Keluaran: halaman|LULUS/GAGAL|detail ke stdout; kode keluar 1 bila ada GAGAL. Nilai kunci tidak pernah dicetak.
set -u
SITE="${SITE%/}"; fail=0; T=$(mktemp -d)
row() { echo "$1|$2|$3"; [ "$2" = GAGAL ] && fail=1; return 0; }
chk() { code=$(curl -s -o "$T/page.html" -w '%{http_code}' -L --max-time 30 "$SITE$1"); ok=GAGAL
  [ "$code" = "200" ] && { [ -z "$2" ] || grep -qi -- "$2" "$T/page.html"; } && ok=LULUS
  row "$1" "$ok" "HTTP $code${2:+, cari \"$2\"}"; }

chk / "VitaminKu"; cp "$T/page.html" "$T/home.html"
chk /kategori ""; chk "/cari?q=vitamin" ""; chk /masuk ""; chk /keranjang ""; chk /admin/panduan ""
chk /sitemap.xml "/produk/"
n=$(grep -aoE '<loc>[^<]*/produk/[^<]*</loc>' "$T/page.html" | wc -l)
row "produk di sitemap" "$([ "$n" -gt 0 ] && echo LULUS || echo GAGAL)" "$n produk (dibaca server dari database)"
prod=$(grep -aoE '<loc>[^<]*/produk/[^<]*</loc>' "$T/page.html" | head -1 | sed -E 's#<loc>https?://[^/]+##; s#</loc>##')
if [ -n "$prod" ]; then
  chk "$prod" "Rp"
  grep -qiE '"hpp"|hpp:' "$T/page.html" && row "$prod (HPP)" GAGAL "kata hpp ada di halaman" || row "HPP di halaman produk" LULUS "tidak ada"
fi
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$SITE/produk/produk-yang-tidak-ada-uji-asap")
row "produk tidak ada" "$([ "$code" = 404 ] || [ "$code" = 200 ] && echo LULUS || echo GAGAL)" "HTTP $code (bukan galat server)"

# File JavaScript browser: alamat database publik harus ada (variabel VITE terisi), kunci rahasia tidak boleh ada.
leak=0; db=0; files=0
for js in $(grep -aoE '/assets/[^"]+\.js' "$T/home.html" | sort -u | head -60); do
  curl -s --max-time 30 "$SITE$js" > "$T/a.js"; files=$((files + 1))
  grep -aq 'vmhoohfwjtsojgcvopaf' "$T/a.js" && db=1
  [ -n "${SRK:-}" ] && grep -aqF -- "$SRK" "$T/a.js" && leak=1
  [ -n "${AK:-}" ] && grep -aqF -- "$AK" "$T/a.js" && leak=1
done
row "alamat database di browser" "$([ $db = 1 ] && echo LULUS || echo GAGAL)" "$files file JS diperiksa"
row "kunci rahasia di browser" "$([ $leak = 0 ] && echo LULUS || echo GAGAL)" "$([ $leak = 0 ] && echo tidak ditemukan || echo DITEMUKAN)"
rm -rf "$T"; exit $fail
