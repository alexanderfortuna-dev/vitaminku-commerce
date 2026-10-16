# Tombol HP — jalankan database VitaminKu tanpa laptop

**SEKALI SAJA (pasang kunci, ±5 menit, browser HP)**
1. supabase.com → proyek **vmhoohfwjtsojgcvopaf** → tombol **Connect** → tab **"Session pooler"** → salin URI. Jika belum tahu password database: **Project Settings → Database → Reset database password** → salin, ganti `[YOUR-PASSWORD]` di URI.
2. **Project Settings → API** → salin **Project URL** dan **service_role key**.
3. github.com/alexanderfortuna-dev/vitaminku-commerce → **Settings → Secrets and variables → Actions → New repository secret**, buat 3: `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. (Opsional ke-4: `SITE_URL` = alamat situs, agar undangan membuka /masuk.)

**SETIAP KALI EKSEKUSI (±30 detik, aplikasi GitHub)**
4. **Actions → "VitaminKu DB" → Run workflow** → branch **feat/launch-ready-v3** → mode **migrate** → confirm **JALANKAN** → **Run**.
5. Tunggu centang hijau → buka → baca tabel **LULUS/GAGAL**.
6. Mode **invite** (isi email Livita & Admin, confirm JALANKAN) → mereka klik email undangan → otomatis masuk di /masuk (tanpa password).
7. Mode **bootstrap** (confirm JALANKAN) → akun Owner, Co-Owner, Admin aktif. Yang belum klik undangan akan terlewat; ulangi bootstrap setelah mereka klik.

Catatan: mode **verify** hanya membaca (aman kapan saja). Migrate berjalan dalam satu transaksi: bila gagal, tidak ada yang berubah. Kunci tidak pernah tampil di log.
