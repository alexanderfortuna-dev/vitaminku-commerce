// Peringkat adil Vita (deterministik, tanpa AI). Skor = kecocokan tujuan + kecocokan kata + budget + stok + foto + nilai per sajian.
// TIDAK ADA bobot dari merek, margin, harga modal, atau "merek toko". Keragaman: ≥2 merek bila tersedia, 1 produk per kelompok varian.
import { evidenceFor, type Evidence } from "./evidence";
import {
  goalById,
  isVitaExcluded,
  parseServings,
  productForm,
  productTags,
  type Form,
  type GoalId,
  type Profile,
  type Tag,
} from "./taxonomy";

/** Baris katalog yang boleh dibaca Vita (kolom eksplisit, tanpa harga modal; stok hanya ada/tidak). */
export interface CatalogRow {
  id: string;
  name: string;
  brand: string;
  category: string | null;
  subcategory: string | null;
  size: string | null;
  servings: string | null;
  dose: string | null;
  flavor: string | null;
  price: number;
  in_stock: boolean;
  image: string | null;
  slug: string;
  pack_count: string | null;
  variant_group: string | null;
}

export interface Ranked {
  row: CatalogRow;
  score: number;
  /** Skor relevansi (tujuan/kata) tanpa bonus kecil — dipakai untuk ambang keragaman. */
  relevance: number;
  tags: Set<Tag>;
  form: Form | null;
  servings: number | null;
  costPerServing: number | null;
  brandNamed: boolean;
}

const SINGLE_SACHET = /\bsachet\b(?!s)|\b1\s?sachet\b/i;

export function variantKey(r: Pick<CatalogRow, "name" | "brand" | "variant_group">): string {
  if (r.variant_group) return `vg:${r.variant_group.toLowerCase()}`;
  // Nama katalog berpola "Merek Produk Ukuran Rasa": ambil kata sebelum ukuran/jumlah pertama.
  // "Alpha Whey 2lbs Chocolate" dan "Alpha Whey 2lbs Vanilla" → "alpha whey".
  const words = r.name.toLowerCase().replace(/[^a-z0-9.+ ]/g, " ").split(/\s+/).filter(Boolean);
  const size = /^(\d+(\.\d+)?(lbs?|kg|g|gr|gram|ml|mg|iu|mcg|oz)?|box|isi)$/;
  const cut = words.findIndex((w, i) => i > 0 && size.test(w));
  return (cut > 0 ? words.slice(0, cut) : words.slice(0, 4)).slice(0, 5).join(" ");
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Merek yang disebut pelanggan (dicocokkan utuh per kata, juga tanpa spasi: "muscle tech" = "MuscleTech"). */
export function namedBrands(profile: Profile, rows: CatalogRow[]): string[] {
  const words = profile.normalized.split(" ");
  const joined = norm(profile.normalized);
  const out: string[] = [];
  for (const b of new Set(rows.map((r) => r.brand))) {
    const nb = norm(b.replace(/\(.*?\)/g, ""));
    if (nb.length < 3) continue;
    const bw = b.toLowerCase().replace(/\(.*?\)/g, "").trim().split(/\s+/);
    const asWords = bw.every((w) => words.includes(w.replace(/[^a-z0-9.+]/g, "")));
    if (asWords || (nb.length >= 5 && joined.includes(nb))) out.push(b);
  }
  return out;
}

export interface RankOptions {
  /** Batasi hasil ke tujuan tertentu (mis. tool AI). */
  goals?: GoalId[];
}

export function rankCandidates(rows: CatalogRow[], profile: Profile, opts: RankOptions = {}): Ranked[] {
  const goals = (opts.goals ?? profile.goals).map(goalById);
  const brands = namedBrands(profile, rows).map((b) => b.toLowerCase());
  const terms = profile.terms.filter((t) => !brands.some((b) => b.includes(t)));
  const seen = new Set<string>();
  const out: Ranked[] = [];

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (!(row.price > 0) || isVitaExcluded(row, profile)) continue;
    if (profile.budget && row.price > profile.budget) continue;
    const tags = productTags(row);
    const nameTags = productTags({ ...row, subcategory: null });
    const form = productForm(row);
    const name = row.name.toLowerCase();

    // Batasan keras dari pelanggan.
    if (profile.form && form && form !== profile.form) continue;
    if (profile.noCaffeine && (tags.has("preworkout") || /\b(caffeine|kafein|coffee|kopi|energy drink|guarana)\b/.test(name))) continue;
    if (profile.vegan && goals.some((g) => g.id === "protein") && !tags.has("plant_protein")) continue;
    if (profile.lactoseFree && tags.has("protein") && !(tags.has("isolate") || tags.has("plant_protein") || /lactose|laktosa/.test(name))) continue;

    // Kecocokan tujuan: tujuan pertama & tag pertama paling kuat.
    let goalScore = 0;
    goals.forEach((g, gi) => {
      g.tags.forEach((t, ti) => {
        // Cocok lewat nama lebih kuat daripada hanya lewat subkategori ("Mganik 3 Peptide" di subkategori Protein).
        if (tags.has(t)) goalScore = Math.max(goalScore, 100 - gi * 12 - ti * 8 - (nameTags.has(t) ? 0 : 25));
      });
    });
    const brandNamed = brands.includes(row.brand.toLowerCase());
    let termScore = 0;
    for (const t of terms) if (t.length > 2 && name.includes(t)) termScore += 15;
    if (brandNamed) termScore += goals.length ? 30 : 60;
    if (goals.length && goalScore === 0) {
      // Disebut merek tapi bukan jenis yang diminta ("evolene whey" → bukan creatine Evolene).
      if (!termScore || brandNamed) continue;
    }
    const relevance = goalScore + termScore;
    if (relevance <= 0) continue;

    const servings = parseServings(row);
    // Biaya per sajian < Rp 1.000 hampir pasti salah baca nama ("100 Sachets" untuk satu sachet): jangan ditampilkan.
    const cps = servings && servings > 1 ? Math.round(row.price / servings) : null;
    const costPerServing = cps !== null && cps >= 1000 ? cps : null;
    let score = relevance;
    if (row.in_stock) score += 3;
    if (row.image) score += 2;
    if (profile.flavor && `${row.name} ${row.flavor ?? ""}`.toLowerCase().includes(profile.flavor)) score += 6;
    if (profile.form && form === profile.form) score += 4;
    if (profile.budget && row.price >= profile.budget * 0.4) score += 3; // memakai budget dengan wajar, bukan sekadar termurah
    if (SINGLE_SACHET.test(row.name) && !/sachet/.test(profile.normalized)) score -= 10; // satu sachet bukan rekomendasi utama
    out.push({ row, score, relevance, tags, form, servings, costPerServing, brandNamed });
  }

  // Nilai: biaya per sajian termurah di antara yang setara mendapat sedikit tambahan (0–6).
  const costs = out.map((r) => r.costPerServing).filter((c): c is number => c !== null).sort((a, b) => a - b);
  if (costs.length > 1)
    for (const r of out)
      if (r.costPerServing !== null) r.score += Math.round(6 * (1 - costs.indexOf(r.costPerServing) / (costs.length - 1)));
  if (profile.wantsCheap) {
    const prices = out.map((r) => r.row.price).sort((a, b) => a - b);
    for (const r of out) r.score += Math.round(10 * (1 - prices.indexOf(r.row.price) / Math.max(1, prices.length - 1)));
  }
  return out.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
}

/**
 * Pilih maks 3 produk dengan aturan adil:
 * - Merek disebut: produk terbaik merek itu + 2 alternatif terbaik dari merek lain.
 * - Bandingkan 2+ merek: produk terbaik per merek yang disebut.
 * - Selain itu: satu produk per merek dulu (≥2 merek bila tersedia), satu per kelompok varian.
 */
export function selectFair(ranked: Ranked[], profile: Profile, max = 3): Ranked[] {
  const picked: Ranked[] = [];
  const variants = new Set<string>();
  const add = (r: Ranked | undefined) => {
    if (!r || picked.length >= max || picked.includes(r)) return false;
    const vk = variantKey(r.row);
    if (variants.has(vk)) return false;
    picked.push(r);
    variants.add(vk);
    return true;
  };
  const brandOf = (r: Ranked) => r.row.brand.toLowerCase();
  const named = [...new Set(ranked.filter((r) => r.brandNamed).map(brandOf))];

  if (profile.compare && named.length >= 2) {
    for (const b of named) add(ranked.find((r) => brandOf(r) === b));
  } else if (named.length) {
    for (const b of named) add(ranked.find((r) => brandOf(r) === b));
  }
  // Ambang relevansi: alternatif harus setingkat dengan produk teratas (bukan sekadar beda merek).
  const top = Math.max(0, ...ranked.filter((r) => !r.brandNamed).map((r) => r.relevance));
  const tiers = [ranked.filter((r) => !r.brandNamed && r.relevance >= top - 20), ranked.filter((r) => !r.brandNamed), ranked];
  for (const pool of tiers) {
    for (const r of pool) if (!picked.some((p) => brandOf(p) === brandOf(r))) add(r);
    if (picked.length >= max) break;
  }
  // Masih kurang (merek sedikit): izinkan merek yang sama, maks 2 per merek.
  for (const r of ranked) {
    if (picked.length >= max) break;
    if (picked.filter((p) => brandOf(p) === brandOf(r)).length < 2) add(r);
  }
  return picked;
}

// ---------- Penjelasan jujur per produk (tanpa klaim penyakit) ----------
interface Blurb {
  reason: string;
  good: string;
  not: string;
}
const BLURB: Partial<Record<Tag, Blurb>> = {
  plant_protein: { reason: "Protein nabati (tanpa susu sapi) untuk melengkapi protein harian.", good: "Anda vegan atau menghindari susu", not: "Anda mencari harga per sajian termurah" },
  isolate: { reason: "Jenis isolate: proteinnya tinggi dan biasanya lebih bersahabat untuk perut yang sensitif susu (cek label).", good: "Anda ingin protein tinggi dengan sedikit lemak", not: "Anda mencari harga per sajian termurah" },
  protein: { reason: "Protein bubuk yang praktis untuk melengkapi kebutuhan protein harian, enak diminum setelah latihan.", good: "melengkapi protein harian", not: "Anda sensitif laktosa (pilih isolate atau nabati)" },
  gainer: { reason: "Tinggi kalori dan karbohidrat untuk Anda yang sulit menambah berat badan.", good: "Anda sulit naik berat badan", not: "Anda sedang menurunkan berat badan" },
  creatine: { reason: "Creatine, salah satu suplemen olahraga yang paling banyak diteliti, cocok menemani latihan beban.", good: "latihan beban atau sprint rutin", not: "Anda mengharapkan hasil instan" },
  amino: { reason: "Asam amino yang praktis diminum sebelum, saat, atau setelah latihan.", good: "latihan panjang atau saat perut kosong", not: "asupan protein harian Anda sudah cukup" },
  preworkout: { reason: "Diminum sebelum latihan; umumnya mengandung kafein, cek label.", good: "Anda butuh semangat sebelum latihan", not: "Anda sensitif kafein atau latihan malam hari" },
  fatburner: { reason: "Pendamping program diet; hasil tetap bergantung pada pola makan dan latihan.", good: "program diet yang disertai latihan", not: "Anda sensitif kafein atau punya kondisi jantung (tanya dokter)" },
  meal: { reason: "Pengganti makan praktis dengan porsi terukur.", good: "jadwal padat dan ingin porsi terkontrol", not: "Anda ingin menambah berat badan" },
  fiber: { reason: "Serat untuk melengkapi asupan harian.", good: "asupan sayur dan buah Anda kurang", not: "Anda sedang punya keluhan pencernaan berat (tanya dokter)" },
  electrolyte: { reason: "Mengganti cairan dan elektrolit saat banyak berkeringat.", good: "olahraga lama atau cuaca panas", not: "Anda sedang membatasi garam (tanya dokter)" },
  vitc: { reason: "Vitamin C untuk melengkapi asupan harian.", good: "asupan buah Anda kurang", not: "Anda sudah minum multivitamin dengan vitamin C tinggi" },
  vitd: { reason: "Vitamin D untuk melengkapi asupan harian.", good: "Anda jarang terkena sinar matahari", not: "Anda sudah minum vitamin D dari produk lain" },
  zinc: { reason: "Zinc untuk melengkapi asupan mineral harian.", good: "melengkapi asupan mineral", not: "Anda sudah minum multivitamin dengan zinc" },
  magnesium: { reason: "Magnesium untuk melengkapi asupan mineral harian.", good: "rutinitas malam yang rileks", not: "Anda punya gangguan ginjal (tanya dokter)" },
  omega: { reason: "Sumber omega-3 untuk melengkapi asupan harian.", good: "Anda jarang makan ikan", not: "Anda minum obat pengencer darah (tanya dokter)" },
  collagen: { reason: "Kolagen untuk rutinitas perawatan dari dalam.", good: "rutinitas perawatan kulit dari dalam", not: "Anda alergi ikan atau sapi (cek sumber kolagen di label)" },
  glutathione: { reason: "Antioksidan populer untuk rutinitas perawatan kulit.", good: "rutinitas perawatan kulit", not: "Anda sedang hamil atau menyusui (tanya dokter)" },
  biotin: { reason: "Biotin untuk rutinitas perawatan rambut dan kuku.", good: "rutinitas rambut dan kuku", not: "Anda akan cek laboratorium (biotin bisa memengaruhi hasil; beri tahu dokter)" },
  multivitamin: { reason: "Multivitamin untuk melengkapi kebutuhan vitamin dan mineral harian.", good: "pola makan Anda kurang bervariasi", not: "Anda sudah minum suplemen lain dengan kandungan serupa" },
  probiotic: { reason: "Probiotik untuk rutinitas pencernaan.", good: "rutinitas pencernaan harian", not: "daya tahan tubuh Anda sedang sangat lemah (tanya dokter)" },
  melatonin: { reason: "Banyak dipilih untuk rutinitas tidur.", good: "pola tidur yang tidak teratur", not: "Anda hamil, menyusui, atau minum obat tidur (tanya dokter)" },
  ashwagandha: { reason: "Herbal yang populer untuk menemani rutinitas yang lebih rileks.", good: "rutinitas rileks", not: "Anda hamil, menyusui, atau punya kondisi tiroid (tanya dokter)" },
  theanine: { reason: "Asam amino dari teh yang populer untuk rutinitas tenang.", good: "rutinitas tenang tanpa kantuk", not: "Anda sedang minum obat tekanan darah (tanya dokter)" },
  joint: { reason: "Pilihan populer untuk rutinitas kesehatan sendi.", good: "Anda aktif bergerak atau berolahraga", not: "Anda alergi kerang (cek label)" },
  cognitive: { reason: "Pilihan populer untuk rutinitas fokus.", good: "masa belajar atau kerja padat", not: "Anda sedang minum obat rutin (tanya apoteker)" },
  eye: { reason: "Pilihan populer untuk rutinitas menjaga mata.", good: "banyak menatap layar", not: "Anda sedang minum obat rutin (tanya apoteker)" },
  calcium: { reason: "Kalsium untuk melengkapi asupan mineral harian.", good: "asupan susu Anda kurang", not: "Anda punya riwayat batu ginjal (tanya dokter)" },
  iron: { reason: "Zat besi untuk melengkapi asupan mineral harian.", good: "asupan daging merah Anda kurang", not: "Anda belum tahu kadar zat besi (tanya dokter)" },
  vitb: { reason: "Vitamin B untuk melengkapi asupan harian.", good: "melengkapi asupan harian", not: "Anda sudah minum multivitamin dengan vitamin B" },
};
const BLURB_ORDER: Tag[] = [
  "plant_protein", "isolate", "gainer", "creatine", "protein", "amino", "preworkout", "fatburner", "meal", "fiber", "electrolyte",
  "melatonin", "ashwagandha", "theanine", "collagen", "glutathione", "biotin", "joint", "omega", "probiotic", "multivitamin", "vitc", "vitd",
  "zinc", "magnesium", "calcium", "iron", "vitb", "cognitive", "eye",
];

export function blurbFor(tags: Set<Tag>): Blurb {
  for (const t of BLURB_ORDER) if (tags.has(t) && BLURB[t]) return BLURB[t]!;
  return { reason: "Sesuai kebutuhan yang Anda sebutkan.", good: "kebutuhan yang Anda sebutkan", not: "Anda punya kondisi medis tertentu (tanya apoteker)" };
}

export interface VitaProductExtras {
  reason: string;
  good_for: string;
  not_for: string;
  cost_per_serving: number | null;
  servings: number | null;
  /** Takaran dari label produk (kolom dose), apa adanya. */
  dose: string | null;
  form: Form | null;
  evidence: Pick<Evidence, "ingredient" | "range" | "source"> | null;
}

export function explain(r: Ranked, opts: { medicalContext?: boolean } = {}): VitaProductExtras {
  const b = blurbFor(r.tags);
  const ev = opts.medicalContext ? null : evidenceFor(r.tags);
  return {
    reason: b.reason,
    good_for: b.good,
    not_for: b.not,
    cost_per_serving: r.costPerServing,
    servings: r.servings,
    dose: r.row.dose?.trim() || null,
    form: r.form,
    evidence: ev ? { ingredient: ev.ingredient, range: ev.range, source: ev.source } : null,
  };
}
