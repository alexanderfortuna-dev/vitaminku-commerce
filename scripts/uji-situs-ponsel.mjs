// Uji tampilan ponsel 375px di situs produksi (hanya membuka halaman publik; tidak login, tidak memesan).
// Pakai: SITE=https://vitaminku.vercel.app node scripts/uji-situs-ponsel.mjs  (butuh paket playwright)
// Keluaran: halaman|LULUS/GAGAL|detail; kode keluar 1 bila ada GAGAL.
import { chromium } from "playwright";

const SITE = (process.env.SITE ?? "").replace(/\/$/, "");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
let fail = 0;
const row = (a, ok, d) => { console.log(`${a}|${ok ? "LULUS" : "GAGAL"}|${d}`); if (!ok) fail = 1; };

async function check(path, expect) {
  const errors = [];
  page.removeAllListeners("pageerror");
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 80)));
  const res = await page.goto(SITE + path, { waitUntil: "networkidle", timeout: 45000 }).catch(() => null);
  await page.waitForTimeout(1500);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  const text = await page.evaluate(() => document.body.innerText);
  const ok = !!res && res.status() < 400 && wide <= 380 && errors.length === 0 && (!expect || expect.test(text));
  row(`375px ${path}`, ok, `HTTP ${res?.status() ?? "-"}, lebar ${wide}px, galat JS ${errors.length}${errors[0] ? ` (${errors[0]})` : ""}`);
  return text;
}

await check("/", /VitaminKu/i);
await check("/kategori");
const cari = await check("/cari?q=vitamin");
row("hasil cari 'vitamin'", /Rp\s?\d/.test(cari), /Rp\s?\d/.test(cari) ? "harga tampil" : "tidak ada harga di hasil cari");

const sm = await (await fetch(SITE + "/sitemap.xml")).text();
const prod = (sm.match(/<loc>[^<]*(\/produk\/[^<]+)<\/loc>/) ?? [])[1];
if (prod) {
  const t = await check(prod, /Rp\s?\d/);
  row("tombol beli/WA di produk", /Keranjang|Tanya harga|WhatsApp/i.test(t), "teks tombol dicari");
}
await check("/keranjang");

// Seller Center tanpa login harus mengarah ke halaman masuk, bukan menampilkan data.
await page.goto(SITE + "/admin", { waitUntil: "networkidle", timeout: 45000 }).catch(() => null);
await page.waitForTimeout(2000);
const url = page.url();
row("Seller Center tanpa login", /\/(admin\/login|masuk)/.test(url), `berakhir di ${url.replace(SITE, "") || "/"}`);

await browser.close();
process.exit(fail);
