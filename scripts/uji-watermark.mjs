// Bukti watermark foto di bundel server Vercel: menjalankan kode HASIL BUILD (.vercel/output/functions/__server.func)
// dengan mesin gambar (sharp) yang ikut terbawa di bundel itu, di Node + OS yang sama dengan Vercel (linux-x64).
// Tidak menyentuh produksi dan tidak mengunggah apa pun. Pakai: node scripts/uji-watermark.mjs [folder_func]
// Keluaran: uji|LULUS/GAGAL|detail
import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FUNC = resolve(process.argv[2] ?? ".vercel/output/functions/__server.func");
let fail = 0;
const row = (a, ok, d) => { console.log(`${a}|${ok ? "LULUS" : "GAGAL"}|${d}`); if (!ok) fail = 1; };

try {
  const chunk = readdirSync(join(FUNC, "_ssr")).find((f) => /^photo-process\.server-.*\.mjs$/.test(f));
  row("bundel memuat kode watermark", !!chunk, chunk ?? "photo-process.server-*.mjs tidak ada");
  row("sharp linux-x64 ada di bundel", existsSync(join(FUNC, "node_modules/@img/sharp-linux-x64/lib")) && existsSync(join(FUNC, "node_modules/@img/sharp-libvips-linux-x64/lib")), `node ${process.version}, ${process.platform}-${process.arch}`);
  const { processUpload } = await import(pathToFileURL(join(FUNC, "_ssr", chunk)).href);
  // sharp dipanggil dari node_modules di dalam bundel (bukan dari repo), persis seperti fungsi server di Vercel (sharp 0.35 = ESM, titik masuk dist/index.mjs).
  const sharp = (await import(pathToFileURL(join(FUNC, "node_modules/sharp/dist/index.mjs")).href)).default;

  // Foto uji sintetis (polos hijau + blok gelap di kiri atas) agar selisih piksel mudah diukur.
  const W = 1200, H = 900;
  const fixture = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 40, g: 120, b: 60 } } })
    .composite([{ input: { create: { width: 200, height: 150, channels: 3, background: { r: 10, g: 10, b: 10 } } }, left: 20, top: 20 }])
    .jpeg({ quality: 90 }).toBuffer();

  const raw = async (buf) => {
    const r = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    return { d: r.data, w: r.info.width, h: r.info.height, c: r.info.channels };
  };
  const meanDiff = (a, b, x0, y0, x1, y1) => {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let k = 0; k < 3; k++) {
      s += Math.abs(a.d[(y * a.w + x) * a.c + k] - b.d[(y * b.w + x) * b.c + k]); n++;
    }
    return s / n;
  };

  const wm = await processUpload(new Uint8Array(fixture), { watermark: true });
  const plain = await processUpload(new Uint8Array(fixture), { watermark: false });
  const isWebp = (u) => Buffer.from(u.slice(0, 4)).toString() === "RIFF" && Buffer.from(u.slice(8, 12)).toString() === "WEBP";
  row("hasil berformat WebP", isWebp(wm) && isWebp(plain), `${wm.length} byte dengan watermark, ${plain.length} byte tanpa`);

  const a = await raw(Buffer.from(wm)), b = await raw(Buffer.from(plain));
  row("ukuran foto sama dengan aslinya", a.w === W && a.h === H && b.w === W && b.h === H, `${a.w}x${a.h}`);
  const br = meanDiff(a, b, Math.round(W * 0.72), Math.round(H * 0.88), Math.round(W * 0.96), Math.round(H * 0.97));
  const tl = meanDiff(a, b, 10, 10, 300, 200);
  row("logo tampak di pojok kanan bawah", br > 8, `selisih rata-rata ${br.toFixed(1)} (>8 = ada logo)`);
  row("bagian lain foto tidak berubah", tl < 2, `selisih rata-rata kiri atas ${tl.toFixed(2)} (<2)`);

  // Foto sangat kecil: tidak boleh gagal (watermark dilewati, foto tetap jadi).
  const tiny = await sharp({ create: { width: 90, height: 70, channels: 3, background: { r: 200, g: 200, b: 200 } } }).jpeg().toBuffer();
  const t = await processUpload(new Uint8Array(tiny), { watermark: true });
  row("foto sangat kecil tetap diproses", isWebp(t), `${t.length} byte`);

  // Berkas rusak: ditolak dengan pesan jelas, bukan menggantung.
  let msg = "";
  try { await processUpload(new Uint8Array(Buffer.from("bukan gambar")), { watermark: true }); } catch (e) { msg = String(e.message); }
  row("berkas rusak ditolak jelas", /tidak bisa diproses/.test(msg), msg.slice(0, 60) || "tidak ada galat (salah)");
} catch (e) {
  row("uji watermark", false, String(e?.message ?? e).slice(0, 160));
}
process.exit(fail);
