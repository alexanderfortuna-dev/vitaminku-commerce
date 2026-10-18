// Impor Foto dari ekspor Shopee — logika murni (tanpa jaringan/DB).
// Server menjalankan planner ini untuk pratinjau DAN lagi saat menerapkan; hasil pratinjau browser tidak dipercaya.
// Prinsip: hanya kecocokan yang PASTI dipasang otomatis. Semua yang ambigu masuk "perlu ditinjau" dan baru
// dipasang bila pemilik memilih produknya secara eksplisit.
import type { RawCell } from "./bulk-price-stock";
import { MAX_PHOTOS } from "./seller-import";
import { checkDownloadUrl } from "./image-fetch-guard";

// ---------- normalisasi nama ----------

const UNIT: Record<string, string> = {
  mg: "mg", mcg: "mcg", ug: "mcg", gr: "gr", g: "gr", gram: "gr", grams: "gr",
  kg: "kg", ml: "ml", l: "l", iu: "iu", ui: "iu",
};

/** Huruf kecil, tanpa aksen/tanda baca/spasi ganda; "500 mg" = "500mg", "60 gram" = "60gr". */
export function normalizeName(input: unknown): string {
  let t = String(input ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  t = t.replace(/&/g, " dan ");
  t = t.replace(/(\d)[.,](?=\d)/g, "$1\uE000"); // pemisah desimal dijaga
  t = t.replace(/[^a-z0-9\uE000\s]/g, " ");
  t = t.replace(/\uE000/g, ".");
  t = t.replace(/(\d(?:\.\d+)?)\s*(grams|gram|mcg|mg|ug|gr|kg|ml|iu|ui|g|l)\b/g, (_m, n: string, u: string) => `${n}${UNIT[u]}`);
  return t.replace(/\s+/g, " ").trim();
}

const STOP = new Set([
  "dan", "the", "isi", "original", "ori", "asli", "ready", "stok", "stock", "bpom", "promo", "murah",
  "resmi", "official", "new", "baru", "grosir", "termurah", "ed", "exp",
]);
const STRENGTH = /^\d+(\.\d+)?(mg|mcg|gr|kg|ml|iu|l)$/;

function tokenSet(norm: string): Set<string> {
  return new Set(norm.split(" ").filter((t) => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t))));
}

/** Bagian token terkecil yang ada di nama satunya (0..1). Nama Shopee biasanya lebih panjang, jadi pakai min(). */
export function nameSimilarity(a: string, b: string): number {
  const A = tokenSet(normalizeName(a));
  const B = tokenSet(normalizeName(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

/** Dua nama dianggap berlawanan bila kekuatan/ukuran (mis. 500mg vs 1000mg) tak ada yang sama, atau kemiripannya < 0.4. */
export function namesConflict(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb || na === nb) return false;
  const sa = [...tokenSet(na)].filter((t) => STRENGTH.test(t));
  const sb = new Set([...tokenSet(nb)].filter((t) => STRENGTH.test(t)));
  if (sa.length && sb.size && !sa.some((t) => sb.has(t))) return true;
  return nameSimilarity(a, b) < 0.4;
}

// ---------- tipe ----------

export interface ShopeeRow {
  /** Nomor baris di file (dasar kunci baris). */
  row: number;
  sku: string;
  name: string;
  urls: string[];
}

export interface ProductLite {
  id: string;
  sku: string;
  name: string;
  images: string[];
  blocked?: boolean;
}

export type PlanMode = "lewati" | "timpa";
export interface Candidate {
  id: string;
  sku: string;
  name: string;
  fotoAda: number;
}
export type TinjauKode = "nama_ganda" | "sku_ganda" | "nama_berbeda" | "url_dipakai_lain" | "baris_ganda" | "mirip";
export type GalatJenis = "url_rusak" | "tanpa_foto" | "tidak_cocok";

export interface PastiItem {
  key: string;
  row: ShopeeRow;
  produk: { id: string; sku: string; name: string };
  urls: string[];
  dasar: "sku" | "nama";
  catatan: string[];
}
export interface TinjauItem {
  key: string;
  row: ShopeeRow;
  urls: string[];
  alasan: string;
  kode: TinjauKode;
  kandidat: Candidate[];
  catatan: string[];
}
export interface DilewatiItem {
  key: string;
  row: ShopeeRow;
  produk: { id: string; sku: string; name: string } | null;
  alasan: string;
}
export interface GalatItem {
  key: string;
  row: ShopeeRow;
  jenis: GalatJenis;
  alasan: string;
}
export interface ShopeePlan {
  totalBaris: number;
  pasti: PastiItem[];
  tinjau: TinjauItem[];
  dilewati: DilewatiItem[];
  galat: GalatItem[];
}

// ---------- perencana ----------

const MAX_CANDIDATES = 8;
const text = (s: unknown) => String(s ?? "").trim();

function candidate(p: ProductLite): Candidate {
  return { id: p.id, sku: p.sku, name: p.name, fotoAda: p.images.length };
}

type Draft =
  | { kind: "pasti"; row: ShopeeRow; urls: string[]; notes: string[]; product: ProductLite; dasar: "sku" | "nama" }
  | { kind: "tinjau"; row: ShopeeRow; urls: string[]; notes: string[]; alasan: string; kode: TinjauKode; kandidat: ProductLite[] };

export function planShopeePhotos(
  rows: readonly ShopeeRow[],
  products: readonly ProductLite[],
  opts: { mode?: PlanMode } = {},
): ShopeePlan {
  const mode: PlanMode = opts.mode === "timpa" ? "timpa" : "lewati";
  const plan: ShopeePlan = { totalBaris: 0, pasti: [], tinjau: [], dilewati: [], galat: [] };

  const bySku = new Map<string, ProductLite[]>();
  const byName = new Map<string, ProductLite[]>();
  const push = (m: Map<string, ProductLite[]>, k: string, p: ProductLite) => {
    if (!k) return;
    const list = m.get(k);
    if (list) list.push(p);
    else m.set(k, [p]);
  };
  const normalized = products.map((p) => ({ p, n: normalizeName(p.name) }));
  for (const { p, n } of normalized) {
    push(bySku, p.sku.trim().toLowerCase(), p);
    push(byName, n, p);
  }

  const drafts: Draft[] = [];

  for (const row of rows) {
    const key = String(row.row);
    const sku = text(row.sku);
    const name = text(row.name);
    const rawUrls = (row.urls ?? []).map(text).filter(Boolean);
    if (!sku && !name && rawUrls.length === 0) continue; // baris kosong
    plan.totalBaris++;

    if (rawUrls.length === 0) {
      plan.galat.push({ key, row, jenis: "tanpa_foto", alasan: "Tidak ada URL foto di baris ini." });
      continue;
    }
    const bad = rawUrls.map((u) => ({ u, c: checkDownloadUrl(u, { httpsOnly: true }) })).filter((x) => !x.c.ok);
    if (bad.length) {
      const first = bad[0]!;
      const why = first.c.ok ? "" : first.c.reason;
      plan.galat.push({
        key, row, jenis: "url_rusak",
        alasan: `URL foto rusak (${why}): ${first.u.slice(0, 80)}${bad.length > 1 ? ` (+${bad.length - 1} lagi)` : ""}`,
      });
      continue;
    }
    const notes: string[] = [];
    let urls = [...new Set(rawUrls)];
    if (urls.length > MAX_PHOTOS) {
      notes.push(`Hanya ${MAX_PHOTOS} foto pertama dipakai (ada ${urls.length}).`);
      urls = urls.slice(0, MAX_PHOTOS);
    }

    // (1) SKU persis
    const skuHits = sku ? (bySku.get(sku.toLowerCase()) ?? []) : [];
    if (skuHits.length > 1) {
      drafts.push({
        kind: "tinjau", row, urls, notes, kode: "sku_ganda", kandidat: skuHits.slice(0, MAX_CANDIDATES),
        alasan: `SKU ${sku} cocok dengan ${skuHits.length} produk.`,
      });
      continue;
    }
    if (skuHits.length === 1) {
      const p = skuHits[0]!;
      if (name && namesConflict(name, p.name)) {
        const extra = (byName.get(normalizeName(name)) ?? []).filter((x) => x.id !== p.id);
        drafts.push({
          kind: "tinjau", row, urls, notes, kode: "nama_berbeda", kandidat: [p, ...extra].slice(0, MAX_CANDIDATES),
          alasan: `SKU cocok tetapi nama berbeda jauh. Shopee: "${name.slice(0, 70)}". Produk: "${p.name.slice(0, 70)}".`,
        });
      } else {
        drafts.push({ kind: "pasti", row, urls, notes, product: p, dasar: "sku" });
      }
      continue;
    }

    // (2) SKU kosong / tidak ada → nama ternormalisasi persis
    const nn = normalizeName(name);
    const nameHits = nn ? (byName.get(nn) ?? []) : [];
    if (nameHits.length === 1) {
      drafts.push({ kind: "pasti", row, urls, notes, product: nameHits[0]!, dasar: "nama" });
      continue;
    }
    if (nameHits.length > 1) {
      drafts.push({
        kind: "tinjau", row, urls, notes, kode: "nama_ganda", kandidat: nameHits.slice(0, MAX_CANDIDATES),
        alasan: `Nama cocok dengan ${nameHits.length} produk. Pilih yang benar.`,
      });
      continue;
    }

    // (3) tidak ada kecocokan: tawarkan produk yang sangat mirip (hanya saran, perlu dipilih pemilik)
    const similar = nn
      ? normalized
          .map(({ p }) => ({ p, s: nameSimilarity(name, p.name) }))
          .filter((x) => x.s >= 0.75 && tokenSet(nn).size >= 2 && !namesConflict(name, x.p.name))
          .sort((a, b) => b.s - a.s)
          .slice(0, 3)
          .map((x) => x.p)
      : [];
    if (similar.length) {
      drafts.push({
        kind: "tinjau", row, urls, notes, kode: "mirip", kandidat: similar,
        alasan: sku ? `SKU ${sku} tidak ada; ada produk bernama mirip.` : "Nama tidak persis sama; ada produk bernama mirip.",
      });
    } else {
      plan.galat.push({
        key, row, jenis: "tidak_cocok",
        alasan: sku ? `SKU ${sku} tidak ada di toko dan nama tidak cocok.` : "SKU kosong dan nama tidak cocok dengan produk mana pun.",
      });
    }
  }

  // Satu produk muncul di >1 baris.
  const pastiByProduct = new Map<string, Array<Extract<Draft, { kind: "pasti" }>>>();
  for (const d of drafts) {
    if (d.kind !== "pasti") continue;
    const list = pastiByProduct.get(d.product.id);
    if (list) list.push(d);
    else pastiByProduct.set(d.product.id, [d]);
  }
  const dupSkipped = new Set<Draft>();
  const downgraded = new Map<Draft, { alasan: string; kode: TinjauKode }>();
  for (const [, list] of pastiByProduct) {
    if (list.length < 2) continue;
    const sig = (d: Draft) => d.urls.join("\n");
    if (list.every((d) => sig(d) === sig(list[0]!))) {
      for (const d of list.slice(1)) dupSkipped.add(d);
      for (const d of list.slice(1)) {
        plan.dilewati.push({
          key: String(d.row.row), row: d.row, produk: pick(d),
          alasan: `Baris ganda: sama dengan baris ${list[0]!.row.row}.`,
        });
      }
    } else {
      for (const d of list) {
        downgraded.set(d, {
          kode: "baris_ganda",
          alasan: `Produk yang sama ada di baris ${list.map((x) => x.row.row).join(", ")} dengan foto berbeda.`,
        });
      }
    }
  }

  // Satu URL foto dipakai >1 produk berbeda (termasuk kandidat dari baris yang belum pasti).
  const urlProducts = new Map<string, Map<string, ProductLite>>();
  for (const d of drafts) {
    if (dupSkipped.has(d)) continue;
    const prods = d.kind === "pasti" ? [d.product] : d.kandidat;
    for (const u of d.urls) {
      let m = urlProducts.get(u);
      if (!m) urlProducts.set(u, (m = new Map()));
      for (const p of prods) m.set(p.id, p);
    }
  }
  for (const d of drafts) {
    if (d.kind !== "pasti" || dupSkipped.has(d) || downgraded.has(d)) continue;
    const others = new Map<string, ProductLite>();
    for (const u of d.urls) for (const [id, p] of urlProducts.get(u) ?? []) if (id !== d.product.id) others.set(id, p);
    if (others.size) {
      downgraded.set(d, {
        kode: "url_dipakai_lain",
        alasan: `Foto yang sama juga dipakai produk lain: ${[...others.values()].slice(0, 3).map((p) => p.sku).join(", ")}${others.size > 3 ? "…" : ""}.`,
      });
    }
  }

  // Susun keluaran sesuai urutan baris.
  for (const d of drafts) {
    if (dupSkipped.has(d)) continue;
    const key = String(d.row.row);
    const down = downgraded.get(d);
    if (d.kind === "tinjau" || down) {
      const t = d.kind === "tinjau" ? d : null;
      plan.tinjau.push({
        key, row: d.row, urls: d.urls, catatan: d.notes,
        alasan: t ? t.alasan : down!.alasan,
        kode: t ? t.kode : down!.kode,
        kandidat: (t ? t.kandidat : [(d as Extract<Draft, { kind: "pasti" }>).product]).map(candidate),
      });
      continue;
    }
    const p = d.product;
    if (p.blocked) {
      plan.dilewati.push({ key, row: d.row, produk: pick(d), alasan: "Produk diblokir (daftar terlarang)." });
    } else if (p.images.length > 0 && mode === "lewati") {
      plan.dilewati.push({ key, row: d.row, produk: pick(d), alasan: `Sudah punya ${p.images.length} foto.` });
    } else {
      plan.pasti.push({
        key, row: d.row, produk: { id: p.id, sku: p.sku, name: p.name }, urls: d.urls, dasar: d.dasar, catatan: d.notes,
      });
    }
  }
  const byRow = (a: { row: ShopeeRow }, b: { row: ShopeeRow }) => a.row.row - b.row.row;
  plan.dilewati.sort(byRow);
  plan.galat.sort(byRow);
  return plan;
}

function pick(d: Extract<Draft, { kind: "pasti" }>) {
  return { id: d.product.id, sku: d.product.sku, name: d.product.name };
}

// ---------- pemilihan yang boleh diterapkan (dipakai server) ----------

export interface ApplyRequestItem {
  key: string;
  productId: string;
  /** Bila dikirim, harus sama persis dengan hasil pencocokan ulang di server. */
  urls?: string[];
  /** true = pemilik memilih produk ini secara eksplisit untuk baris "perlu ditinjau". */
  pilihan?: boolean;
}
export interface ApplyJob {
  key: string;
  row: number;
  productId: string;
  sku: string;
  urls: string[];
  dasar: "sku" | "nama" | "pilihan";
}

/**
 * Dari rencana (dihitung ulang di server) pilih hanya yang boleh dipasang:
 * - baris "pasti" bila productId sama dengan hasil pencocokan;
 * - baris "perlu ditinjau" HANYA bila pemilik memilih (pilihan=true) dan produknya termasuk kandidat.
 * Selebihnya ditolak dengan alasan.
 */
export function selectApplicable(
  plan: ShopeePlan,
  items: readonly ApplyRequestItem[],
  mode: PlanMode = "lewati",
): { jobs: ApplyJob[]; ditolak: Array<{ key: string; alasan: string }> } {
  const pasti = new Map(plan.pasti.map((p) => [p.key, p]));
  const tinjau = new Map(plan.tinjau.map((t) => [t.key, t]));
  const jobs: ApplyJob[] = [];
  const ditolak: Array<{ key: string; alasan: string }> = [];
  const usedProducts = new Set<string>();
  const usedKeys = new Set<string>();

  for (const it of items) {
    const reject = (alasan: string) => void ditolak.push({ key: it.key, alasan });
    if (usedKeys.has(it.key)) {
      reject("Baris dikirim dua kali.");
      continue;
    }
    usedKeys.add(it.key);
    const sameUrls = (urls: string[]) => !it.urls || (it.urls.length === urls.length && it.urls.every((u, i) => u === urls[i]));

    const p = pasti.get(it.key);
    if (p) {
      if (p.produk.id !== it.productId) reject("Produk berbeda dari hasil pencocokan di server.");
      else if (!sameUrls(p.urls)) reject("Daftar foto berubah sejak pratinjau.");
      else if (usedProducts.has(p.produk.id)) reject("Produk ini sudah ada di batch yang sama.");
      else {
        usedProducts.add(p.produk.id);
        jobs.push({ key: p.key, row: p.row.row, productId: p.produk.id, sku: p.produk.sku, urls: p.urls, dasar: p.dasar });
      }
      continue;
    }
    const t = tinjau.get(it.key);
    if (t) {
      const c = t.kandidat.find((k) => k.id === it.productId);
      if (!it.pilihan) reject("Perlu ditinjau: pilih produknya secara manual.");
      else if (!c) reject("Produk yang dipilih bukan kandidat baris ini.");
      else if (!sameUrls(t.urls)) reject("Daftar foto berubah sejak pratinjau.");
      else if (c.fotoAda > 0 && mode === "lewati") reject(`Produk sudah punya ${c.fotoAda} foto.`);
      else if (usedProducts.has(c.id)) reject("Produk ini sudah ada di batch yang sama.");
      else {
        usedProducts.add(c.id);
        jobs.push({ key: t.key, row: t.row.row, productId: c.id, sku: c.sku, urls: t.urls, dasar: "pilihan" });
      }
      continue;
    }
    reject("Baris ini tidak bisa dipasang (dilewati, galat, atau tidak ada).");
  }
  return { jobs, ditolak };
}

// ---------- deteksi kolom ekspor Shopee ----------

export interface ShopeeColumns {
  /** Indeks kolom SKU, urut prioritas (baris memakai yang pertama terisi). */
  sku: number[];
  name: number;
  /** Indeks kolom gambar, urut: sampul dulu, lalu nomor naik. */
  images: number[];
}

function normHeader(h: unknown): string {
  return String(h ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const SKU_HEADERS = ["sku", "nomor referensi sku", "sku reference no", "sku referensi", "kode sku", "sku produk", "sku induk", "parent sku"];
const NAME_HEADERS = ["nama produk", "product name", "nama", "judul produk", "nama barang", "product title"];

function imageOrder(h: string): number | null {
  const mentionsImage = /\b(gambar|foto|image|img|photo|picture|pic)\b/.test(h);
  if (!mentionsImage) return null;
  if (/\b(variasi|variation|variant)\b/.test(h)) return null;
  if (/\b(sampul|cover|utama|main)\b/.test(h)) return 0;
  const num = /\b(\d{1,2})$/.exec(h);
  if (num && /^(gambar|foto|image|img|photo|picture|pic)( produk| product| item)? ?\d{1,2}$/.test(h)) return Number(num[1]);
  if (/^(url )?(gambar|foto|image|photo)( url)?$/.test(h)) return 50;
  return null;
}

export function detectShopeeColumns(header: readonly RawCell[]): ShopeeColumns {
  const hs = header.map(normHeader);
  const sku: number[] = [];
  for (const want of SKU_HEADERS) {
    const i = hs.indexOf(want);
    if (i >= 0 && !sku.includes(i)) sku.push(i);
  }
  let name = -1;
  for (const want of NAME_HEADERS) {
    const i = hs.indexOf(want);
    if (i >= 0) {
      name = i;
      break;
    }
  }
  const images = hs
    .map((h, i) => ({ i, o: imageOrder(h) }))
    .filter((x): x is { i: number; o: number } => x.o !== null)
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.i);
  return { sku, name, images };
}

const EMPTY_TOKENS = new Set(["-", "n/a", "na", "null", "none", "tidak ada"]);

/** Sel foto bisa berisi beberapa URL (dipisah spasi/baris baru/koma/titik koma). */
export function extractUrls(cell: RawCell): string[] {
  const s = text(cell);
  if (!s || EMPTY_TOKENS.has(s.toLowerCase())) return [];
  return s.split(/[\s,;|]+/).map((u) => u.trim()).filter((u) => u && !EMPTY_TOKENS.has(u.toLowerCase()));
}

export interface ShopeeParse {
  rows: ShopeeRow[];
  info: { headerRow: number; skuHeaders: string[]; nameHeader: string | null; imageHeaders: string[]; barisDiabaikan: number };
}

/** Grid (baris pertama = header, atau header dalam 15 baris pertama) → baris Shopee. */
export function gridToShopeeRows(grid: readonly (readonly RawCell[])[]): ShopeeParse {
  let headerRow = -1;
  let cols: ShopeeColumns | null = null;
  for (let i = 0; i < Math.min(15, grid.length); i++) {
    const c = detectShopeeColumns(grid[i] ?? []);
    if (c.images.length > 0 && (c.sku.length > 0 || c.name >= 0)) {
      headerRow = i;
      cols = c;
      break;
    }
  }
  if (!cols) {
    throw new Error(
      "Kolom foto dan SKU/Nama tidak ditemukan. Pastikan file ekspor Shopee punya kolom seperti 'SKU' atau 'Nama Produk' dan 'Gambar Sampul' / 'Foto Produk 1'.",
    );
  }
  const head = grid[headerRow] ?? [];
  const label = (i: number) => text(head[i]);
  const rows: ShopeeRow[] = [];
  let skipped = 0;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const cells = grid[r] ?? [];
    const sku = cols.sku.map((i) => text(cells[i])).find(Boolean) ?? "";
    const urls = cols.images.flatMap((i) => extractUrls(cells[i]));
    const name = cols.name >= 0 ? text(cells[cols.name]) : "";
    if (!sku && urls.length === 0) {
      if (name) skipped++;
      continue;
    }
    rows.push({ row: r + 1, sku, name, urls });
  }
  return {
    rows,
    info: {
      headerRow: headerRow + 1,
      skuHeaders: cols.sku.map(label),
      nameHeader: cols.name >= 0 ? label(cols.name) : null,
      imageHeaders: cols.images.map(label),
      barisDiabaikan: skipped,
    },
  };
}
