# Vitamin Finder (LA_AGENT_01_VITAMIN_FINDER)

Asisten belanja di gelembung chat Vita. Edge Function Supabase (Deno) `vitamin-finder` memanggil model
`claude-haiku-5-5` (API Anthropic Messages, tool use). Satu-satunya tool: `search_products` (hanya baca).

## Cara kerja singkat
- Logika murni: `supabase/functions/_shared/vitamin-finder-core.ts` (tanpa Deno, diuji vitest). Glue: `supabase/functions/vitamin-finder/index.ts`.
- Produk dibaca dengan kunci anon (RLS tetap berlaku, tanpa service_role): aktif, tidak diblokir, harga > 0, hanya kolom
  id, name, brand, price, size, image, slug. HPP dan angka stok tidak pernah dibaca.
- Pesan terlarang (modafinil, SARM, yohimbe, DHEA, obat keras) dan pertanyaan medis dijawab tanpa memanggil model.
- Batas laju: RPC `chat_rate_hit`, 20 pesan / 10 menit per hash IP+user-agent (gagal-terbuka).
- Output tidak valid: diulang maks 2x, lalu fallback WhatsApp (status `error`, `needs_human` true).

## Deploy (dilakukan pemilik, bukan agen)
```
supabase secrets set ANTHROPIC_API_KEY=<isi-kunci-di-sini> --project-ref vmhoohfwjtsojgcvopaf
supabase functions deploy vitamin-finder --project-ref vmhoohfwjtsojgcvopaf
```
`verify_jwt = false` sudah ada di `supabase/config.toml`. `SUPABASE_URL` dan `SUPABASE_ANON_KEY` disediakan platform.
Tanpa `ANTHROPIC_API_KEY` fungsi tetap hidup: UI menampilkan tombol WhatsApp.

## Env
| Nama | Di mana | Keterangan |
| --- | --- | --- |
| ANTHROPIC_API_KEY | Edge secret | Wajib untuk jawaban AI. Jangan di browser/repo. |
| VITE_VITAMIN_FINDER_URL | Env publik (opsional) | Default `${VITE_SUPABASE_URL}/functions/v1/vitamin-finder`. |
| VITE_SUPABASE_PUBLISHABLE_KEY | Env publik | Dikirim sebagai header `apikey`. |

## Cara uji
- Otomatis: `npx vitest run src/lib/__tests__/vitamin-finder.test.ts src/lib/__tests__/vitamin-finder-client.test.ts` (model di-mock).
- Manual setelah deploy: `curl -X POST <URL> -H "apikey: <PUBLISHABLE_KEY>" -H "content-type: application/json" -d '{"session_id":"uji-1","message":"mau tambah massa otot","history":[]}'`
- Cek: modafinil/DHEA -> tanpa produk + `needs_human` true; "saya hamil" -> saran dokter; matikan kunci -> fallback WhatsApp.
