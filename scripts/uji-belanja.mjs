// Uji jalur belanja tamu di 375px (Playwright) pada $SITE, mode terang & gelap: menghitung KETUKAN dan DETIK
// dari beranda sampai tombol "Pesan via WhatsApp" aktif. Pesanan TIDAK dikirim (tidak membuat data uji di toko);
// ketukan terakhir dihitung tanpa ditekan. Juga: tanpa geser samping, tanpa kedipan tema, kontras AA, tanpa "hpp".
// Pakai: SITE=https://... node scripts/uji-belanja.mjs   (butuh paket playwright). Keluaran: uji|LULUS/GAGAL|detail.
import { chromium } from "playwright";

const SITE = (process.env.SITE ?? "").replace(/\/$/, "");
const MAX_TAPS = 8;
const MAX_SECONDS = 90;
let fail = 0;
const row = (a, ok, d) => { console.log(`${a}|${ok ? "LULUS" : "GAGAL"}|${d}`); if (!ok) fail = 1; };
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}); // PW_CHANNEL=chrome: Chrome bawaan runner

async function newPage(theme, extraInit) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, colorScheme: "light" });
  if (theme === "dark") await ctx.addInitScript(() => localStorage.setItem("vitaminku-theme", "dark"));
  if (extraInit) await ctx.addInitScript(extraInit);
  const page = await ctx.newPage();
  const leaks = [];
  page.on("response", async (r) => {
    const ct = r.headers()["content-type"] ?? "";
    if (!r.url().startsWith(SITE) || !/html|json/.test(ct)) return;
    try {
      const t = await r.text();
      if (/"hpp"|\bhpp\s*:/i.test(t)) leaks.push(r.url().replace(SITE, ""));
    } catch { /* badan respons tidak terbaca */ }
  });
  return { ctx, page, leaks };
}

const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth);
// Audit mode gelap satu halaman: latar body + kontras AA teks utama. Warna dinormalkan lewat canvas
// karena Chromium mengembalikan oklch(...) apa adanya untuk token tema (bukan rgb).
async function auditDark(page) {
  return page.evaluate(() => {
    // Warna apa pun (oklch, rgb, hex) → [r,g,b,a] lewat piksel canvas 1×1 (Chromium menyerialkan oklch apa adanya).
    const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
    const px = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#010203"; cx.fillStyle = c; if (cx.fillStyle === "#010203" && !/^#010203$|rgb\(1, 2, 3\)/.test(c)) return null; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data]; };
    const parse = (s) => { const d = px(s); return d && d[3] > 0 ? d.slice(0, 3) : null; };
    const alpha = (s) => { const d = px(s); return d ? d[3] / 255 : 0; };
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bodyBg = parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255];
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && alpha(c) > 0.9 && parse(c)) return parse(c);
      }
      return bodyBg;
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const bad = [];
    const els = [...document.querySelectorAll("h1, h2, p, a, button, label, span")].filter((e) => e.offsetParent && e.textContent?.trim()).slice(0, 400);
    for (const e of els) {
      const cs = getComputedStyle(e);
      const fg = parse(cs.color); if (!fg || alpha(cs.color) < 0.9) continue;
      const big = parseFloat(cs.fontSize) >= 18.66 || (parseFloat(cs.fontSize) >= 14 && Number(cs.fontWeight) >= 700);
      const r = ratio(fg, bgOf(e));
      if (r < (big ? 3 : 4.5)) bad.push(`${e.tagName.toLowerCase()} "${e.textContent.trim().slice(0, 24)}" ${r.toFixed(1)}`);
    }
    return { bg: `rgb(${bodyBg.join(", ")})`, dark: lum(bodyBg) < 0.08, bad };
  });
}

async function flow(theme, label, opts = {}) {
  const { ctx, page, leaks } = await newPage(theme, opts.init);
  let taps = 0;
  const tap = async (locator, name) => { await locator.first().click({ timeout: 20000 }); taps++; return name; };
  const t0 = Date.now();
  try {
    await page.goto(SITE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
    const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    row(`${label}: tema terpasang sebelum render`, dark === (theme === "dark"), `kelas dark=${dark}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    // Produk pertama yang bisa dibeli (kartu dengan tombol "+ Keranjang"), bukan produk tanpa harga.
    await tap(page.locator('article:has(button:has-text("Keranjang")) a[href^="/produk/"]'), "produk");
    await page.waitForURL(/\/produk\//, { timeout: 30000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    const beli = page.getByRole("button", { name: /Beli Sekarang/i });
    await beli.waitFor({ state: "visible", timeout: 20000 });
    await tap(beli, "beli sekarang");
    // Bila ketukan jatuh sebelum halaman selesai aktif (hidrasi), ketuk sekali lagi; ketukan ulang ikut dihitung (jujur ke pengalaman pelanggan).
    const navigated = await page.waitForURL(/\/checkout/, { timeout: 8000 }).then(() => true).catch(() => false);
    if (!navigated) { await tap(beli, "beli sekarang (ulang)"); await page.waitForURL(/\/checkout/, { timeout: 30000 }); }
    await page.waitForLoadState("networkidle").catch(() => {});
    const inputs = page.locator("input, textarea");
    const name = page.locator('input[autocomplete="name"]');
    if (!opts.repeat) {
      await tap(name, "nama"); await name.fill("Uji Belanja");
      const wa = page.locator('input[autocomplete="tel"]'); await tap(wa, "wa"); await wa.fill("081234567890");
      const addr = page.locator('textarea[autocomplete="street-address"]'); await tap(addr, "alamat"); await addr.fill("Jl. Uji No. 1, Sanur, Denpasar (uji otomatis, tidak dikirim)");
    }
    if (opts.promo) {
      const promoIn = page.locator('input[placeholder="Opsional"]');
      await tap(promoIn, "promo"); await promoIn.fill(opts.promo);
      await tap(page.getByRole("button", { name: /^Pakai$/ }), "pakai");
      // Tunggu jawaban server (harga dihitung ulang di server): kode valid → "dipakai"; kode salah → pesan "tidak berlaku" dan tanpa potongan.
      await page.waitForFunction((valid) => (valid ? /dipakai/ : /tidak berlaku/).test(document.body.innerText), opts.promoValid, { timeout: 10000 }).catch(() => {});
      const body = await page.evaluate(() => document.body.innerText);
      const pesan = body.match(/[^\n]*(dipakai|tidak berlaku)[^\n]*/)?.[0]?.trim().slice(0, 100) ?? "(tidak ada pesan)";
      const okPromo = opts.promoValid ? /dipakai/.test(body) : /tidak berlaku/.test(body) && !/dipakai|Diskon\s*-\s*Rp/i.test(body);
      row(`${label}: kode promo ${opts.promo}`, okPromo, pesan);
    }
    await page.locator('input[autocomplete="tel"]').blur().catch(() => {});
    const submit = page.getByRole("button", { name: /Pesan via WhatsApp|Lanjut ke Pengiriman/i });
    await submit.waitFor({ timeout: 20000 });
    await page.waitForFunction(() => { const b = [...document.querySelectorAll("button")].find((x) => /Pesan via WhatsApp|Lanjut ke Pengiriman/i.test(x.textContent || "")); return b && !b.disabled; }, null, { timeout: 20000 });
    // Mode kurir online (Midtrans aktif): masih ada langkah Pengiriman + Pembayaran = 2 ketukan lagi.
    const multiStep = await page.getByRole("button", { name: /Lanjut ke Pengiriman/i }).count();
    if (multiStep) taps += 2;
    taps++; // ketukan terakhir dihitung, tidak ditekan (tidak membuat pesanan uji)
    const secs = (Date.now() - t0) / 1000;
    const w = await wide(page);
    row(`${label}: ketukan ≤ ${MAX_TAPS}`, taps <= MAX_TAPS, `${taps} ketukan`);
    row(`${label}: waktu ≤ ${MAX_SECONDS} dtk`, secs <= MAX_SECONDS, `${secs.toFixed(1)} dtk (robot; termasuk muat halaman)`);
    row(`${label}: tanpa geser samping`, w <= 380, `lebar ${w}px`);
    row(`${label}: tanpa "hpp" di HTML/JSON`, leaks.length === 0, leaks.slice(0, 3).join(", ") || "bersih");
    void inputs;
    return { taps, secs };
  } catch (e) {
    row(`${label}: alur belanja`, false, String(e.message).slice(0, 140));
    return null;
  } finally {
    await ctx.close();
  }
}

// Kode promo diambil dari spanduk toko bila ada (kode promo bersifat publik).
async function bannerPromo() {
  const { ctx, page } = await newPage("light");
  try {
    await page.goto(SITE + "/", { waitUntil: "networkidle", timeout: 45000 });
    const t = await page.evaluate(() => document.body.innerText);
    return t.match(/kode ([A-Z0-9]{3,32})/)?.[1] ?? null;
  } catch { return null; } finally { await ctx.close(); }
}

const promo = await bannerPromo();
const first = await flow("light", "terang, pelanggan baru");
await flow("dark", "gelap, pelanggan baru");
await flow("light", "terang, kode promo salah", { promo: "TIDAKADA", promoValid: false });
if (promo) await flow("light", `terang, kode promo ${promo}`, { promo, promoValid: true });
else console.log("promo berjalan|INFO|tidak ada spanduk promo di beranda, uji kode valid dilewati");
const repeat = await flow("light", "terang, pelanggan ulang", {
  repeat: true,
  init: () => localStorage.setItem("vitaminku-checkout-details", JSON.stringify({ name: "Uji Ulang", whatsapp: "081234567890", address: "Jl. Uji No. 2, Sanur, Denpasar (uji otomatis)" })),
});

// Mode gelap per halaman: tanpa geser samping, latar gelap, kontras AA pada teks utama.
for (const path of ["/", "/kategori", "/keranjang", "/akun", "/masuk", "/bantuan"]) {
  const { ctx, page } = await newPage("dark");
  try {
    await page.goto(SITE + path, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(800);
    const a = await auditDark(page);
    row(`gelap ${path}: latar gelap & kontras AA`, a.dark && a.bad.length === 0, `latar ${a.bg}${a.bad.length ? "; kontras rendah: " + a.bad.slice(0, 3).join(" | ") : ""}`);
    const w = await wide(page);
    row(`gelap ${path}: tanpa geser samping`, w <= 380, `lebar ${w}px`);
  } catch (e) { row(`gelap ${path}`, false, String(e.message).slice(0, 100)); } finally { await ctx.close(); }
}
if (first && repeat) console.log(`ringkasan|INFO|pelanggan baru ${first.taps} ketukan / ${first.secs.toFixed(1)} dtk; pelanggan ulang ${repeat.taps} ketukan / ${repeat.secs.toFixed(1)} dtk`);
await browser.close();
process.exit(fail);
