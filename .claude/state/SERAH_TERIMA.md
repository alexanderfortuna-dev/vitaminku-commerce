# Serah terima sesi (2026-11-17) — baca ini dulu, lalu 30 baris terakhir PROGRESS.md
Cabang kerja: claude/vk-lepas-lovable (produksi = 6752850, dpl_GJNR2wPqpaMTkHPPivz22cdNX1Bp). Rollback: dpl_5B3NryBC1eARzVoYfb6HrnKCkPnF.
Owner (Kings Alexander) memberi IZIN PENUH sampai toko selesai; tanya hanya data/klarifikasi. Hemat token: hasil dulu, ID hanya di "Lampiran teknis".
Alat: Vercel MCP (project vitaminku), GitHub MCP (workflow vitaminku-db.yml ref fix/vitaminku-launch-v2: mode cek-saja, input site_url, bukti_ref), Firecrawl scrape untuk cek DNS publik (dns.google/resolve), Playwright jalan di workflow (sandbox tidak bisa buka vercel.app/supabase.co).
## Antrean
1. Baca hasil cek-saja produksi terakhir (workflow run setelah 19:28 UTC 2026-11-17); jika ada GAGAL → perbaiki atau rollback.
2. Domain www.vitaminku.id: DNS Domainesia "lame delegation" (REFUSED). Saat owner bilang beres: cek dns.google, Vercel get_domain_config misconfigured:false, lalu edit env produksi SITE_URL(pWlr8Ow2hNDbeAvw)/VITE_SITE_URL(PgLa9CG6IWbh3Q58)/PUBLIC_SITE_URL(XdrqsCa848X4PCF7)=https://www.vitaminku.id, create_deployment production (gitSource cabang+sha terbaru teruji), cek-saja site_url=https://www.vitaminku.id.
3. Fitur yang bisa dikerjakan agen: "Lupa kata sandi" staf admin (belum ada; resetPasswordForEmail + halaman setel ulang), redirect harus diizinkan di Supabase Auth URL Configuration (tugas owner).
4. Tugas owner (sudah dikomunikasikan): Supabase Auth Site URL + redirect domain baru; cabut token Shopify lama; data berat/dimensi produk; kode pos/peta/WA cabang; kunci ANTHROPIC/MIDTRANS/BITESHIP; cabang produksi Vercel.
