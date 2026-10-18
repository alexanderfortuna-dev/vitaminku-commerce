// Pencocokan foto Shopee (CSV "clean") ke produk VitaminKu. Murni, tanpa I/O.
// Aturan pemilik: judul/deskripsi/kategori Shopee TIDAK PERNAH disalin ke products; nama Shopee hanya dipakai untuk mencocokkan.
// Dosis (mg/mcg/iu), ukuran (g/kg/lbs/ml), isi kemasan (kapsul/tablet/softgel/sachet/serving) dan rasa harus SAMA PERSIS.
// Hanya kecocokan yakin (>= 0,9) dengan satu kandidat jelas yang masuk "auto"; sisanya "perlu ditinjau". Tidak menebak.
import { parseCsv } from "./bulk-price-stock";

export const MAX_PHOTOS = 9;
export const AUTO_MIN_CONFIDENCE = 0.9;
/** Selisih minimal antara kandidat terbaik dan kedua agar disebut "satu kandidat jelas". */
export const AUTO_MIN_MARGIN = 0.08;
/** Di bawah ini tidak ditampilkan sebagai saran sama sekali. */
export const SUGGEST_MIN_CONFIDENCE = 0.55;

export interface ShopeeItem {
  itemId: string;
  /** Hanya untuk mencocokkan dan ditampilkan di antrean tinjauan; tidak pernah ditulis ke products. */
  name: string;
  /** cover_image dulu, lalu images sesuai urutan, tanpa duplikat, maks 9. */
  images: string[];
  sharedWithOthers: number;
}

export interface VkProduct {
  id: string;
  sku: string;
  name: string;
  dose?: string | null;
  pack_count?: string | null;
  size?: string | null;
  flavor?: string | null;
  images?: string[] | null;
  image_url?: string | null;
}

// ---------- CSV ----------
export function parseShopeeCleanCsv(text: string): { items: ShopeeItem[]; problems: string[] } {
  const grid = parseCsv(text);
  const header = (grid[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (n: string) => header.indexOf(n);
  const iId = col("shopee_item_id");
  const iName = col("match_name_only");
  const iCover = col("cover_image");
  const iImages = col("images");
  const iShared = col("image_shared_with_other_items");
  const problems: string[] = [];
  if (iName < 0 || iImages < 0) return { items: [], problems: ["Kolom match_name_only / images tidak ditemukan."] };
  const items: ShopeeItem[] = [];
  const seenIds = new Set<string>();
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r]!;
    const name = (row[iName] ?? "").trim();
    if (!name) continue;
    const itemId = (iId >= 0 ? row[iId] ?? "" : "").trim() || `baris-${r + 1}`;
    if (seenIds.has(itemId)) {
      problems.push(`Baris ${r + 1}: shopee_item_id ganda (${itemId}), dilewati.`);
      continue;
    }
    seenIds.add(itemId);
    const cover = iCover >= 0 ? (row[iCover] ?? "").trim() : "";
    const list = (row[iImages] ?? "").split("|").map((u) => u.trim());
    const images: string[] = [];
    for (const u of [cover, ...list]) {
      if (/^https:\/\/[^\s]+$/i.test(u) && u.length <= 1000 && !images.includes(u)) images.push(u);
      if (images.length >= MAX_PHOTOS) break;
    }
    const shared = Number((iShared >= 0 ? row[iShared] : "0") || 0);
    items.push({ itemId, name, images, sharedWithOthers: Number.isFinite(shared) ? shared : 0 });
  }
  return { items, problems };
}

// ---------- normalisasi ----------
const FLAVORS: Record<string, string> = {
  vanilla: "vanilla", vanila: "vanilla",
  chocolate: "chocolate", coklat: "chocolate", cokelat: "chocolate", choco: "chocolate",
  strawberry: "strawberry", stroberi: "strawberry",
  banana: "banana", pisang: "banana",
  cookies: "cookies", cookie: "cookies",
  cream: "cream", creamy: "cream",
  caramel: "caramel", karamel: "caramel",
  mocha: "mocha", coffee: "coffee", kopi: "coffee", latte: "coffee",
  mint: "mint", lemon: "lemon", lemonade: "lemon",
  orange: "orange", jeruk: "orange",
  berry: "berry", berries: "berry", blueberry: "blueberry", raspberry: "raspberry", blackcurrant: "blackcurrant",
  mango: "mango", mangga: "mango", peach: "peach", persik: "peach",
  watermelon: "watermelon", semangka: "watermelon",
  grape: "grape", anggur: "grape", apple: "apple", apel: "apple",
  cola: "cola", tropical: "tropical", punch: "punch", cherry: "cherry", pineapple: "pineapple", nanas: "pineapple",
  coconut: "coconut", kelapa: "coconut", matcha: "matcha", taro: "taro", hazelnut: "hazelnut",
  jahe: "ginger", ginger: "ginger", madu: "honey", honey: "honey", peanut: "peanut", kacang: "peanut",
  lychee: "lychee", leci: "lychee", melon: "melon", pina: "pineapple", colada: "colada",
  unflavored: "unflavored", unflavoured: "unflavored", plain: "unflavored", tawar: "unflavored",
  rootbeer: "rootbeer", lime: "lime", kiwi: "kiwi", guava: "guava", jambu: "guava", durian: "durian",
};

const STOP = new Set([
  "bpom", "halal", "original", "ori", "import", "impor", "usa", "us", "suplemen", "supplement", "supplements", "dewasa",
  "kesehatan", "premium", "resmi", "official", "store", "murah", "terbaik", "promo", "free", "gratis", "isi", "per", "dan",
  "yang", "untuk", "dengan", "bantu", "bagi", "rasa", "flavor", "flavour", "box", "pack", "pcs", "buah", "ready", "stock",
  "stok", "baru", "new", "best", "seller", "terlaris", "asli", "dan", "or", "the", "of", "with", "for", "and", "by", "in",
  "kapsul", "capsule", "capsules", "caps", "cap", "tablet", "tablets", "tab", "tabs", "caplet", "caplets", "softgel",
  "softgels", "sgel", "gummy", "gummies", "sachet", "sachets", "serving", "servings", "sajian", "svg", "scoop", "scoops",
  "vegan", "vegetarian", "nonGMO", "gluten", "tanpa", "bebas", "tanpa", "ml", "mg", "mcg", "iu", "gr", "gram", "kg",
  "lbs", "lb", "oz", "isi", "botol", "bottle", "jar", "pouch", "tub", "bag", "sample", "sampel", "trial", "mini",
]);

const SIZE_UNIT: Record<string, "g" | "ml" | "lbs" | "oz"> = {
  g: "g", gr: "g", gram: "g", grams: "g", kg: "g", ml: "ml", l: "ml", lbs: "lbs", lb: "lbs", pound: "lbs", pounds: "lbs", oz: "oz",
};
const DOSE_UNIT: Record<string, string> = { mg: "mg", mcg: "mcg", ug: "mcg", "µg": "mcg", iu: "iu", ui: "iu", cfu: "cfu", "%": "%" };
const COUNT_UNIT: Record<string, string> = {
  kapsul: "cap", capsule: "cap", capsules: "cap", caps: "cap", cap: "cap", vcap: "cap", vcaps: "cap",
  tablet: "tab", tablets: "tab", tab: "tab", tabs: "tab", caplet: "tab", caplets: "tab",
  softgel: "softgel", softgels: "softgel", sgel: "softgel", sgels: "softgel",
  gummy: "gummy", gummies: "gummy", sachet: "sachet", sachets: "sachet", sct: "sachet", pcs: "pcs",
  serving: "serv", servings: "serv", sajian: "serv", svg: "serv", scoop: "scoop", scoops: "scoop",
};

export interface Parsed {
  dose: Set<string>;
  size: Set<string>;
  count: Set<string>;
  flavor: Set<string>;
  tokens: Set<string>;
  /** Urutan kata (setelah disaring) dan gabungan dua kata berurutan: "derma xp" ≈ "dermaxp". */
  list: string[];
  joined: Set<string>;
}

function clean(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2") // 1.000 -> 1000
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\bomega[\s-]*(\d)/g, "omega$1")
    .replace(/\bvit\.?\s*([a-dek]\d?)\b/g, "vitamin $1")
    .replace(/\bvitamin\s+([a-k]\d*)\b/g, "vitamin$1") // "Vitamin C" != "Vitamin D"
    .replace(/\bmulti[\s-]*vitamin\w*/g, "multivitamin")
    .replace(/\bl[\s-](?=[a-z])/g, "") // L-Theanine -> theanine
    .replace(/\bd[\s-](?=[a-z]{4,})/g, "")
    .replace(/&/g, " ")
    .replace(/\+/g, " ");
}

function stem(t: string): string {
  return t.length > 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
}

export function parseName(raw: string): Parsed {
  let s = clean(raw);
  const out: Parsed = { dose: new Set(), size: new Set(), count: new Set(), flavor: new Set(), tokens: new Set(), list: [], joined: new Set() };
  // jumlah + satuan (angka dulu): "500mg", "2 lbs", "60 kapsul", "30 serving", "1,5 kg"
  s = s.replace(/(\d+(?:\.\d+)?)\s*(%|[a-zµ]+)/g, (m, num: string, unit: string) => {
    const n = Number(num);
    if (DOSE_UNIT[unit]) {
      out.dose.add(`${n}${DOSE_UNIT[unit]}`);
      return " ";
    }
    if (SIZE_UNIT[unit]) {
      const base = SIZE_UNIT[unit]!;
      const v = unit === "kg" ? n * 1000 : unit === "l" ? n * 1000 : n;
      out.size.add(`${+v.toFixed(2)}${base}`);
      return " ";
    }
    if (COUNT_UNIT[unit]) {
      out.count.add(`${n}${COUNT_UNIT[unit]}`);
      return " ";
    }
    return m;
  });
  // "isi 60" / "isi 30 kapsul" ditangani di atas; angka lain dibiarkan sebagai token.
  for (const w of s.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (FLAVORS[w]) {
      out.flavor.add(FLAVORS[w]!);
      continue;
    }
    if (STOP.has(w) || w.length < 2) continue;
    if (/^\d+$/.test(w) && w.length < 3) continue; // angka kecil sisa (jumlah box dsb.) bukan identitas produk
    const t = stem(w);
    out.tokens.add(t);
    out.list.push(t);
  }
  for (let i = 0; i + 1 < out.list.length; i++) out.joined.add(out.list[i]! + out.list[i + 1]!);
  return out;
}

/** Tambahan dari kolom terstruktur VitaminKu (dose, pack_count, size, flavor) tanpa menimpa nama. */
export function parseProduct(p: VkProduct): Parsed {
  const base = parseName(p.name);
  for (const extra of [p.dose, p.pack_count, p.size, p.flavor]) {
    if (!extra) continue;
    const e = parseName(extra);
    for (const k of ["dose", "size", "count", "flavor"] as const) for (const v of e[k]) base[k].add(v);
  }
  return base;
}

// ---------- skor ----------
export interface Score {
  confidence: number;
  gate: "ok" | "dose" | "size" | "count" | "flavor";
  /** Satu sisi punya angka/rasa yang tidak ada di sisi lain: tidak bisa dibuktikan sama persis. */
  unverified: boolean;
  recall: number;
  precision: number;
}

function sameSet(a: Set<string>, b: Set<string>) {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/** Berapa kata `a` yang ada di `b`, termasuk kata yang ditulis rapat/terpisah ("DermaXp" vs "Derma Xp"). */
function coveredTokens(a: Parsed, b: Parsed): number {
  const hit = new Set<string>();
  for (const t of a.tokens) if (b.tokens.has(t) || b.joined.has(t)) hit.add(t);
  for (let i = 0; i + 1 < a.list.length; i++) {
    if (b.tokens.has(a.list[i]! + a.list[i + 1]!)) {
      hit.add(a.list[i]!);
      hit.add(a.list[i + 1]!);
    }
  }
  return hit.size;
}

export function score(vk: Parsed, sh: Parsed): Score {
  const matchedVk = coveredTokens(vk, sh);
  const matchedSh = coveredTokens(sh, vk);
  const recall = vk.tokens.size ? matchedVk / vk.tokens.size : 0;
  const precision = sh.tokens.size ? matchedSh / sh.tokens.size : 0;
  let gate: Score["gate"] = "ok";
  let unverified = false;
  for (const k of ["dose", "size", "count", "flavor"] as const) {
    const a = vk[k];
    const b = sh[k];
    if (a.size && b.size && !sameSet(a, b)) {
      gate = k;
      break;
    }
    if (a.size !== b.size && (a.size === 0 || b.size === 0)) unverified = true;
  }
  const confidence = gate === "ok" ? 0.75 * recall + 0.25 * Math.min(1, precision / 0.6) : 0;
  return { confidence: +confidence.toFixed(3), gate, unverified, recall, precision };
}

// ---------- rencana ----------
export interface Candidate {
  itemId: string;
  shopeeName: string;
  confidence: number;
  photos: number;
  shared: number;
  unverified: boolean;
  images: string[];
}

export interface AutoPair {
  productId: string;
  sku: string;
  productName: string;
  item: ShopeeItem;
  confidence: number;
}

export interface ReviewEntry {
  productId: string;
  sku: string;
  productName: string;
  reason: string;
  candidates: Candidate[];
}

export interface CleanPlan {
  auto: AutoPair[];
  review: ReviewEntry[];
  /** Produk aktif tanpa pasangan sama sekali (tidak ada saran >= SUGGEST_MIN_CONFIDENCE). */
  unmatched: Array<{ productId: string; sku: string; productName: string }>;
  skippedHasPhoto: number;
  stats: { products: number; shopeeItems: number; auto: number; review: number; unmatched: number; skippedHasPhoto: number };
}

const hasPhoto = (p: VkProduct) => (p.images?.length ?? 0) > 0 || !!(p.image_url && p.image_url.trim());

export function planShopeeClean(
  items: ShopeeItem[],
  products: VkProduct[],
  opts: { includeWithPhoto?: boolean } = {},
): CleanPlan {
  const targets = products.filter((p) => opts.includeWithPhoto || !hasPhoto(p));
  const skippedHasPhoto = products.length - targets.length;
  const vkP = targets.map(parseProduct);
  const shP = items.map((i) => parseName(i.name));

  // skor semua pasangan yang lolos gerbang
  const byVk: Array<Array<{ j: number; s: Score }>> = targets.map(() => []);
  const byItem: Array<Array<{ i: number; s: Score }>> = items.map(() => []);
  for (let i = 0; i < targets.length; i++) {
    for (let j = 0; j < items.length; j++) {
      const s = score(vkP[i]!, shP[j]!);
      if (s.gate !== "ok" || s.confidence < SUGGEST_MIN_CONFIDENCE) continue;
      byVk[i]!.push({ j, s });
      byItem[j]!.push({ i, s });
    }
  }
  for (const l of byVk) l.sort((a, b) => b.s.confidence - a.s.confidence);
  for (const l of byItem) l.sort((a, b) => b.s.confidence - a.s.confidence);

  const plan: CleanPlan = { auto: [], review: [], unmatched: [], skippedHasPhoto, stats: { products: targets.length, shopeeItems: items.length, auto: 0, review: 0, unmatched: 0, skippedHasPhoto } };
  const margin = (l: Array<{ s: Score }>) => (l.length > 1 ? l[0]!.s.confidence - l[1]!.s.confidence : 1);

  targets.forEach((p, i) => {
    const cands = byVk[i]!;
    const base = { productId: p.id, sku: p.sku, productName: p.name };
    if (cands.length === 0) {
      plan.unmatched.push(base);
      return;
    }
    const toCand = (c: { j: number; s: Score }): Candidate => ({
      itemId: items[c.j]!.itemId, shopeeName: items[c.j]!.name, confidence: c.s.confidence,
      photos: items[c.j]!.images.length, shared: items[c.j]!.sharedWithOthers, unverified: c.s.unverified, images: items[c.j]!.images,
    });
    const top = cands[0]!;
    const item = items[top.j]!;
    const reasons: string[] = [];
    if (top.s.confidence < AUTO_MIN_CONFIDENCE) reasons.push("keyakinan di bawah 0,9");
    if (top.s.unverified) reasons.push("dosis/ukuran/rasa tidak tertulis di salah satu sisi");
    if (margin(cands) < AUTO_MIN_MARGIN) reasons.push("lebih dari satu kandidat mirip");
    if (item.sharedWithOthers > 0) reasons.push("foto dipakai item Shopee lain");
    if (item.images.length === 0) reasons.push("tidak ada foto valid");
    const back = byItem[top.j]!;
    if (back[0]!.i !== i || margin(back) < AUTO_MIN_MARGIN) reasons.push("item Shopee ini juga cocok ke produk VitaminKu lain");
    if (reasons.length) {
      plan.review.push({ ...base, reason: reasons.join("; "), candidates: cands.slice(0, 3).map(toCand) });
      return;
    }
    plan.auto.push({ ...base, item, confidence: top.s.confidence });
  });
  plan.stats.auto = plan.auto.length;
  plan.stats.review = plan.review.length;
  plan.stats.unmatched = plan.unmatched.length;
  return plan;
}
