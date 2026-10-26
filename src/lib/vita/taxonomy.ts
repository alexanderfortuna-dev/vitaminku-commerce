// Taksonomi Vita (berversi): bahasa pelanggan Indonesia → tujuan, jenis produk, budget, bentuk, batasan.
// Murni & deterministik (tanpa AI). Ubah VERSION setiap kali kamus/aturan berubah; tambahkan kasus di evals/vita-golden.json.
import type { HistoryItem } from "../../../supabase/functions/_shared/vitamin-finder-core";

export const TAXONOMY_VERSION = "2026-10-21.1";

// ---------- Jenis produk (tag) dari nama/subkategori produk ----------
export type Tag =
  | "protein"
  | "isolate"
  | "plant_protein"
  | "gainer"
  | "creatine"
  | "amino"
  | "preworkout"
  | "fatburner"
  | "meal"
  | "fiber"
  | "electrolyte"
  | "vitc"
  | "vitd"
  | "vitb"
  | "vite"
  | "zinc"
  | "magnesium"
  | "calcium"
  | "iron"
  | "omega"
  | "collagen"
  | "glutathione"
  | "biotin"
  | "multivitamin"
  | "probiotic"
  | "melatonin"
  | "ashwagandha"
  | "theanine"
  | "joint"
  | "cognitive"
  | "eye"
  | "women"
  | "men"
  | "immune"
  | "energy";

/** Pola nama produk per tag (dicocokkan ke "nama subkategori", huruf kecil). */
export const TAG_PATTERNS: Record<Tag, RegExp> = {
  protein: /\b(whey|protein|isolate|casein|hydroly[sz]ed)\b/,
  isolate: /\b(isolate|hydroly[sz]ed|lactose[\s-]?free)\b/,
  plant_protein: /\b(vegan|plant|pea\s?protein|soy\s?protein|nabati|rice\s?protein)\b/,
  gainer: /\b(gainer|mass\b|serious\s?mass|true\s?mass|bulk)/,
  creatine: /\b(creatin\w*|kre-?alkalyn|crevolene|creden)\b/,
  amino: /\b(bcaa|eaa|amino|glutamin\w*|leucine|citrulline)\b/,
  preworkout: /\b(pre[\s-]?workout|pwo|c4\b|pump)\b/,
  fatburner: /\b(fat\s?burn\w*|burner|carnitin\w*|l-carnitine|cla\b|shred\w*|lean|thermo\w*|cutting|slim\w*)\b/,
  meal: /\b(meal\s?replacement|diet\s?shake|mrp)\b/,
  fiber: /\b(fiber|fibre|serat|psyllium|detox|detoks)\b/,
  electrolyte: /\b(electrolyte\w*|elektrolit|hydration|isotonic|isotonik|salt\s?(stick|cap)|re\.?salt|hydro)\b/,
  vitc: /\b(vitamin\s?c|vit\s?c|ascorbic|ester-?c)\b/,
  vitd: /\b(vitamin\s?d3?|vit\s?d3?|d3\b)/,
  vitb: /\b(vitamin\s?b\d*|b[\s-]?complex|b12|b6)\b/,
  vite: /\b(vitamin\s?e|vit\s?e)\b/,
  zinc: /\b(zinc|zink|seng)\b/,
  magnesium: /\b(magnesium|magnesium\s?glycinate|zma)\b/,
  calcium: /\b(calcium|kalsium)\b/,
  iron: /\b(iron|zat\s?besi|ferrous)\b/,
  omega: /\b(omega|fish\s?oil|krill|minyak\s?ikan|cod\s?liver)\b/,
  collagen: /\b(collagen|kolagen)\b/,
  glutathione: /\b(glutathione|gluta)\b/,
  biotin: /\b(biotin|hair|rambut|nail)\b/,
  multivitamin: /\b(multi[\s-]?vit\w*|multivitamin|daily\s?vit\w*|one\s?a\s?day|multi\s?b\b|multi\s?mineral)/,
  probiotic: /\b(probiotic\w*|probiotik|prebiotic|digest\w*|enzyme)\b/,
  melatonin: /\b(melatonin|sleep|valerian|chamomile)\b/,
  ashwagandha: /\b(ashwagandha|ksm-?66)\b/,
  theanine: /\b(l-?theanine|theanine)\b/,
  joint: /\b(glucosamine|chondroitin|joint|msm|turmeric|curcumin|kunyit|sendi)\b/,
  cognitive: /\b(ginkgo|lion'?s?\s?mane|focus|brain|nootropic|kognitif)\b/,
  eye: /\b(lutein|bilberry|zeaxanthin|eye)\b/,
  women: /\b(women|woman|wanita|her\b|female|ladies)\b/,
  men: /\b(men|man\b|pria|male|him\b)\b/,
  immune: /\b(imun\w*|immun\w*|elderberry|echinacea|propolis|sambucus)\b/,
  energy: /\b(energy|energi|gel\b|bar\b|caffeine|kafein)\b/,
};

/** Subkategori katalog yang langsung menandai tag (bila nama tidak jelas). */
export const SUBCATEGORY_TAG: Record<string, Tag> = {
  Protein: "protein",
  Gainer: "gainer",
  Creatine: "creatine",
  "Asam Amino": "amino",
  "Pre-Workout": "preworkout",
  "Fat Burner & Diet": "fatburner",
  "Meal Replacement": "meal",
  "Serat & Detoks": "fiber",
  "Hidrasi & Elektrolit": "electrolyte",
  "Omega & Minyak Ikan": "omega",
  Multivitamin: "multivitamin",
  Pencernaan: "probiotic",
  "Sendi & Tulang": "joint",
  Imunitas: "immune",
};

/** Kata kunci pencarian katalog per tag (dipakai query ilike/full-text). */
export const TAG_SEARCH: Record<Tag, string[]> = {
  protein: ["whey", "protein", "isolate"],
  isolate: ["isolate", "hydrolyzed"],
  plant_protein: ["vegan", "plant", "pea protein", "soy"],
  gainer: ["gainer", "mass"],
  creatine: ["creatin", "kre-alkalyn"],
  amino: ["bcaa", "eaa", "amino", "glutamine", "citrulline"],
  preworkout: ["pre workout", "pwo"],
  fatburner: ["burner", "carnitine", "cla", "shred"],
  meal: ["meal replacement"],
  fiber: ["fiber", "psyllium", "serat"],
  electrolyte: ["electrolyte", "hydration", "isotonic", "salt"],
  vitc: ["vitamin c", "vit c", "ascorbic"],
  vitd: ["vitamin d", "d3"],
  vitb: ["vitamin b", "b complex", "b12"],
  vite: ["vitamin e"],
  zinc: ["zinc"],
  magnesium: ["magnesium", "zma"],
  calcium: ["calcium", "kalsium"],
  iron: ["iron"],
  omega: ["omega", "fish oil", "krill"],
  collagen: ["collagen", "kolagen"],
  glutathione: ["glutathione"],
  biotin: ["biotin", "hair"],
  multivitamin: ["multivitamin", "multi"],
  probiotic: ["probiotic", "digest", "enzyme"],
  melatonin: ["melatonin", "sleep", "valerian"],
  ashwagandha: ["ashwagandha"],
  theanine: ["theanine"],
  joint: ["glucosamine", "chondroitin", "joint", "turmeric", "msm"],
  cognitive: ["ginkgo", "lion", "focus"],
  eye: ["lutein", "bilberry"],
  women: ["women", "wanita"],
  men: ["men", "pria"],
  immune: ["immune", "elderberry", "echinacea", "propolis"],
  energy: ["energy", "gel"],
};

// ---------- Tujuan pelanggan ----------
export type GoalId =
  | "protein"
  | "massa"
  | "otot"
  | "diet"
  | "energi"
  | "pre_workout"
  | "kreatin"
  | "amino"
  | "tidur"
  | "ashwagandha"
  | "stres"
  | "imun"
  | "vitc"
  | "vitd"
  | "zinc"
  | "magnesium"
  | "omega"
  | "kolagen"
  | "multivit"
  | "sendi"
  | "kulit"
  | "rambut"
  | "pencernaan"
  | "fokus"
  | "mata"
  | "elektrolit"
  | "wanita"
  | "pria"
  | "lansia";

export interface Goal {
  id: GoalId;
  label: string;
  /** Pola pada teks pelanggan yang SUDAH dinormalisasi. */
  re: RegExp;
  /** Tag yang dicari, urut prioritas. */
  tags: Tag[];
  /** Catatan aman yang selalu ditambahkan ke jawaban (opsional). */
  note?: string;
}

// Urutan: jenis produk spesifik dulu, lalu tujuan umum. Tujuan pertama yang cocok = tujuan utama.
export const GOALS: Goal[] = [
  { id: "kreatin", label: "creatine", re: /\bcreatine\b/, tags: ["creatine"] },
  { id: "pre_workout", label: "pre-workout", re: /\b(pre workout|pump|sebelum latihan|semangat latihan)\b/, tags: ["preworkout"] },
  { id: "amino", label: "asam amino & pemulihan", re: /\b(bcaa|eaa|amino|glutamine|recovery|pemulihan|pegal|nyeri otot|setelah latihan)\b/, tags: ["amino"] },
  { id: "massa", label: "menambah massa & berat badan", re: /\b(gainer|massa|bulking|bulk|gemuk|menggemukkan|naik berat|berat badan naik|kurus|kerempeng)\b/, tags: ["gainer", "protein", "creatine"] },
  { id: "protein", label: "kebutuhan protein", re: /\b(protein|whey|isolate|casein)\b/, tags: ["protein"] },
  { id: "diet", label: "program diet", re: /\b(diet|langsing|cutting|turun(in|kan)? berat|menurunkan berat|lemak|fat burner|pembakar lemak|carnitine|kurus(in|kan))\b/, tags: ["fatburner", "meal", "fiber", "protein"] },
  { id: "elektrolit", label: "hidrasi & elektrolit", re: /\b(elektrolit|electrolyte|dehidrasi|ion|lari|marathon|maraton|keringat|hidrasi)\b/, tags: ["electrolyte"] },
  { id: "otot", label: "membentuk otot", re: /\b(otot|muscle|bentuk badan|six pack|fitness|gym|binaraga|nge ?gym)\b/, tags: ["protein", "creatine", "amino"] },
  { id: "vitc", label: "vitamin C", re: /\bvitamin c\b/, tags: ["vitc"] },
  { id: "vitd", label: "vitamin D", re: /\bvitamin d\b/, tags: ["vitd"] },
  { id: "zinc", label: "zinc", re: /\bzinc\b/, tags: ["zinc"] },
  { id: "magnesium", label: "magnesium", re: /\bmagnesium\b/, tags: ["magnesium"] },
  { id: "omega", label: "omega-3", re: /\bomega\b/, tags: ["omega"] },
  { id: "kolagen", label: "kolagen", re: /\bcollagen\b/, tags: ["collagen"] },
  { id: "multivit", label: "multivitamin harian", re: /\b(multivitamin|vitamin harian|vitamin lengkap)\b/, tags: ["multivitamin"] },
  { id: "tidur", label: "kualitas tidur", re: /\b(tidur|insomnia|begadang|melatonin|sleep)\b/, tags: ["melatonin", "magnesium", "ashwagandha"] },
  { id: "ashwagandha", label: "ashwagandha", re: /\bashwagandha\b/, tags: ["ashwagandha"] },
  { id: "stres", label: "rileks & mengelola stres", re: /\b(stres|stress|cemas|tenang|rileks|relax|mood)\b/, tags: ["ashwagandha", "theanine", "magnesium"] },
  { id: "energi", label: "energi & stamina", re: /\b(energi|energy|stamina|capek|lelah|lemas|loyo)\b/, tags: ["electrolyte", "vitb", "multivitamin", "energy"] },
  { id: "imun", label: "daya tahan tubuh", re: /\b(imun|imunitas|daya tahan|kekebalan|flu|pilek|batuk|gampang sakit)\b/, tags: ["vitc", "zinc", "vitd", "immune", "multivitamin"] },
  { id: "sendi", label: "kesehatan sendi & tulang", re: /\b(sendi|lutut|tulang|persendian|engsel)\b/, tags: ["joint", "collagen", "calcium"] },
  { id: "kulit", label: "perawatan kulit dari dalam", re: /\b(kulit|glowing|cerah|keriput|awet muda|jerawat)\b/, tags: ["collagen", "glutathione", "vite"] },
  { id: "rambut", label: "rambut & kuku", re: /\b(rambut|kuku|rontok|botak)\b/, tags: ["biotin", "collagen"] },
  { id: "pencernaan", label: "pencernaan", re: /\b(pencernaan|usus|bab|sembelit|susah bab|probiotic|perut kembung)\b/, tags: ["probiotic", "fiber"] },
  { id: "fokus", label: "fokus & konsentrasi", re: /\b(fokus|focus|konsentrasi|otak|belajar|daya ingat|memori|pikun)\b/, tags: ["omega", "cognitive", "vitb"] },
  { id: "mata", label: "kesehatan mata", re: /\b(mata|penglihatan)\b/, tags: ["eye", "omega"] },
  { id: "wanita", label: "kebutuhan wanita", re: /\b(wanita|perempuan|cewek|women)\b/, tags: ["women", "multivitamin", "iron", "collagen"] },
  { id: "pria", label: "kebutuhan pria", re: /\b(pria|laki laki|laki|cowok|men)\b/, tags: ["men", "multivitamin", "zinc", "omega"] },
  {
    id: "lansia",
    label: "kebutuhan usia lanjut",
    re: /\b(lansia|orang tua|usia lanjut|manula|kakek|nenek)\b/,
    tags: ["multivitamin", "omega", "joint", "calcium", "vitd"],
    note: "Bila sedang minum obat rutin, tanyakan dulu ke dokter atau apoteker sebelum menambah suplemen.",
  },
];

// ---------- Normalisasi bahasa pelanggan ----------
const SLANG: Array<[RegExp, string]> = [
  [/\bsusu (gym|fitness|fitnes|otot|protein|binaraga|fitnes)\b/g, "whey protein"],
  [/\b(w[ae]y|wei|whei|wheyy)\b/g, "whey"],
  [/\b(prot[ie]{1,2}n|protin|protien|proteinn|portein)\b/g, "protein"],
  [/\b(kre?atin[e]?|creatin|kretin|kreatine|creatina)\b/g, "creatine"],
  [/\b(pre ?wo|prewo|pre ?workout|preworkout|pwo)\b/g, "pre workout"],
  [/\b(multi ?vit(amin)?|multivitamin)\b/g, "multivitamin"],
  [/\b(vit\.? ?c|vitc|vitamin ?c)\b/g, "vitamin c"],
  [/\b(vit\.? ?d3?|vitd3?|vitamin ?d3?)\b/g, "vitamin d"],
  [/\b(vit\.? ?e|vitamin ?e)\b/g, "vitamin e"],
  [/\b(vit\.? ?b|vitamin ?b\d*|b ?complex)\b/g, "vitamin b"],
  [/\b(k[oa]l+ag[ei]n|colagen|collagen)\b/g, "collagen"],
  [/\b(ashwa(gandha)?|aswagandha|ashwaganda|ashwagandah)\b/g, "ashwagandha"],
  [/\b(minyak ikan|omega ?3|omega3|fish ?oil)\b/g, "omega"],
  [/\b(seng|zink)\b/g, "zinc"],
  [/\b(mass ?gainer|penggemuk|gainer)\b/g, "gainer"],
  [/\b(isotonik|elektrolit|electrolyte)\b/g, "elektrolit"],
  [/\b(bca|bcaa)\b/g, "bcaa"],
  [/\b(glutamin|glutamine)\b/g, "glutamine"],
  [/\b(probiotik|probiotic)\b/g, "probiotic"],
  [/\b(l ?carnitin[e]?|karnitin)\b/g, "carnitine"],
  [/\bmagnes[iu]+m\b/g, "magnesium"],
  [/\b(gak|ga|nggak|enggak|tdk)\b/g, "tidak"],
  [/\b(yg)\b/g, "yang"],
  [/\b(utk|buat)\b/g, "untuk"],
  [/\b(dgn)\b/g, "dengan"],
];

const VOCAB = [
  "protein",
  "whey",
  "creatine",
  "gainer",
  "collagen",
  "magnesium",
  "melatonin",
  "ashwagandha",
  "multivitamin",
  "glutamine",
  "probiotic",
  "elektrolit",
  "carnitine",
  "isolate",
  "omega",
  "vitamin",
  "biotin",
  "glucosamine",
  "lutein",
  "kolagen",
  "suplemen",
  "pencernaan",
];

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  return d[a.length]![b.length]!;
}

/** Perbaiki salah ketik kata panjang ke kosakata suplemen (jarak edit 1; 2 untuk kata ≥ 9 huruf). */
export function fixTypo(word: string): string {
  if (word.length < 5 || VOCAB.includes(word)) return word;
  let best: string | null = null;
  let bestD = 99;
  for (const v of VOCAB) {
    if (Math.abs(v.length - word.length) > 2) continue;
    const dist = editDistance(word, v);
    if (dist < bestD) {
      bestD = dist;
      best = v;
    }
  }
  const limit = word.length >= 9 ? 2 : 1;
  return best && bestD <= limit ? best : word;
}

/** Huruf kecil, tanda baca → spasi, huruf berulang dirapikan, slang & salah ketik → istilah baku. */
export function normalizeText(input: string): string {
  let t = ` ${input.toLowerCase().normalize("NFKC")} `;
  t = t.replace(/[^\p{L}\p{N}.,\s-]/gu, " ").replace(/([a-z])\1{2,}/g, "$1");
  t = t.replace(/(\d)[.,](\d{3})\b/g, "$1$2").replace(/\s+/g, " ");
  t = t
    .split(" ")
    .map((w) => fixTypo(w))
    .join(" ");
  for (const [re, rep] of SLANG) t = t.replace(re, rep);
  return t.replace(/\s+/g, " ").trim();
}

// ---------- Budget ----------
/** "500rb", "1,2jt", "di bawah 300 ribu", "max 250k", "budget 300", "300an", "Rp500.000" → rupiah maksimum. */
export function parseBudget(raw: string): number | null {
  const t = raw.toLowerCase().replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2").replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2");
  const unit = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(ribu|rb|k|juta|jt)\b/g)].pop();
  if (unit) {
    const n = Number((unit[1] ?? "").replace(",", "."));
    const v = Math.round(n * (unit[2] === "juta" || unit[2] === "jt" ? 1_000_000 : 1_000));
    return v >= 10_000 ? v : null; // "lari 5k" bukan budget
  }
  const rp = t.match(/rp\.?\s*(\d{4,})/);
  if (rp) return Number(rp[1]);
  const an = t.match(/\b(\d{2,3})\s?an\b/);
  if (an) return Number(an[1]) * 1000;
  const cue = t.match(/\b(budget|bujet|dana|harga|max|maks|maksimal|di ?bawah|kurang dari|under|sampai|paling mahal)\s*(rp\.?)?\s*(\d+)\b/);
  if (cue) {
    const n = Number(cue[3]);
    if (n >= 10_000) return n;
    if (n >= 10 && n < 10_000) return n * 1000;
  }
  const big = t.match(/\b(\d{5,8})\b/);
  return big ? Number(big[1]) : null;
}

// ---------- Profil sesi ----------
export type Form = "bubuk" | "kapsul" | "tablet" | "gummy" | "cair";
export interface Profile {
  goals: GoalId[];
  budget: number | null;
  form: Form | null;
  vegan: boolean;
  lactoseFree: boolean;
  noCaffeine: boolean;
  halal: boolean;
  flavor: string | null;
  level: "pemula" | "lanjut" | null;
  compare: boolean;
  wantsCheap: boolean;
  /** Kata sisa (calon merek/nama produk), sudah tanpa kata umum. */
  terms: string[];
  normalized: string;
}

const FORM_RE: Array<[Form, RegExp]> = [
  ["kapsul", /\b(kapsul|capsule|caps|softgel|kaplet)\b/],
  ["tablet", /\b(tablet|tab|kunyah|chewable)\b/],
  ["gummy", /\b(gummy|gummies|permen|jelly)\b/],
  ["bubuk", /\b(bubuk|powder|serbuk|sachet|scoop)\b/],
  ["cair", /\b(cair|liquid|minuman siap|rtd|botol)\b/],
];
const FLAVORS = /\b(coklat|cokelat|chocolate|vanila|vanilla|stroberi|strawberry|cookies|matcha|kopi|coffee|mocha|pisang|banana|mangga|mango|lemon|anggur|grape|unflavored|tanpa rasa)\b/;

const STOPWORDS = new Set(
  (
    "mau ingin pengen pingin cari carikan butuh perlu yang untuk dan atau dengan saya aku gue gw kak min admin dong ya yah nih tuh apa ada bisa tolong rekomendasi rekomendasiin rekomendasikan saran produk suplemen vitamin bagus terbaik paling murah mahal harga budget bujet sekitar di ke dari tidak juga lagi aja saja kalau kalo gimana bagaimana halo hai hi pagi siang sore malam terima kasih makasih rp ribu rb juta jt k tubuh badan susah tambah tambahin naik turun banyak cepat biar supaya agar pemula pake pakai minum diminum enak aman cocok udah sudah sama baru orang punya kasih jual beli harian rutin sehat kesehatan menjaga jaga meningkatkan tingkatkan bawah atas max maks maksimal kurang lebih yg utk sih deh kok kah apakah boleh berapa mana yang mana bandingkan banding vs versus beda perbandingan antara pilih pilihan tanpa bebas rasa bentuk lebih ok oke the best good untuk dgn an buat kapsul tablet bubuk powder gummy gummies serbuk cair laktosa lactose kafein caffeine halal vegan nabati level lanjut advance mulai hemat terjangkau murmer ekonomis sachet"
  ).split(" "),
);

export function detectGoals(normalized: string): GoalId[] {
  const hits: GoalId[] = [];
  for (const g of GOALS) if (g.re.test(normalized) && !hits.includes(g.id)) hits.push(g.id);
  // "protein vegan" dkk. tetap tujuan protein; "massa otot" = massa (bukan otot).
  if (hits.includes("massa") && hits.includes("otot")) hits.splice(hits.indexOf("otot"), 1);
  if (hits.includes("protein") && hits.includes("otot")) hits.splice(hits.indexOf("otot"), 1);
  return hits.slice(0, 3);
}

export function goalById(id: GoalId): Goal {
  return GOALS.find((g) => g.id === id)!;
}

function leftoverTerms(normalized: string, goals: GoalId[]): string[] {
  let rest = ` ${normalized} `;
  for (const id of goals) rest = rest.replace(new RegExp(goalById(id).re.source, "g"), " ");
  rest = rest.replace(FLAVORS, " ").replace(/\b\d+([.,]\d+)?\s*(ribu|rb|k|juta|jt|an)?\b/g, " ");
  return rest
    .split(/[\s.,-]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .slice(0, 4);
}

/** Profil dari pesan sekarang; pesan lanjutan ("yang di bawah 400 ribu", "kapsul") memakai tujuan dari 2 pesan sebelumnya. */
export function parseProfile(message: string, history: HistoryItem[] = []): Profile {
  const normalized = normalizeText(message);
  const prevUser = history.filter((h) => h.role === "user").slice(-2).map((h) => normalizeText(h.content));
  let goals = detectGoals(normalized);
  let terms = leftoverTerms(normalized, goals);
  if (!goals.length && !terms.length && prevUser.length) {
    const ctx = prevUser.join(" ");
    goals = detectGoals(ctx);
    terms = leftoverTerms(ctx, goals);
  }
  const all = `${prevUser.join(" ")} ${normalized}`;
  const formHit = FORM_RE.find(([, re]) => re.test(normalized));
  const flavor = normalized.match(FLAVORS)?.[1] ?? null;
  return {
    goals,
    budget: parseBudget(message) ?? (prevUser.length && !detectGoals(normalized).length ? parseBudget(history.filter((h) => h.role === "user").slice(-2).map((h) => h.content).join(" ")) : null),
    form: formHit ? formHit[0] : null,
    vegan: /\b(vegan|vegetarian|nabati|plant based|plant)\b/.test(all),
    lactoseFree: /\b(laktosa|lactose|intoleran\w*)\b/.test(all),
    noCaffeine: /\b(tidak|tanpa|bebas|non|no|anti)\s?(kafein|caffeine|kopi|stim)\b|\bstim free\b|\bcaffeine free\b/.test(all),
    halal: /\bhalal\b/.test(all),
    flavor,
    level: /\b(pemula|baru mulai|newbie|awal)\b/.test(all) ? "pemula" : /\b(lanjut|advance|advanced|senior|atlet)\b/.test(all) ? "lanjut" : null,
    compare: /\b(bandingkan|banding|vs|versus|beda|bedanya|perbandingan|lebih bagus mana|mana yang lebih)\b/.test(normalized),
    wantsCheap: /\b(murah|hemat|terjangkau|murmer|ekonomis)\b/.test(normalized),
    terms,
    normalized,
  };
}

// ---------- Produk ----------
export interface TaggableRow {
  name: string;
  brand: string;
  subcategory: string | null;
  size?: string | null;
  pack_count?: string | null;
}

export function productTags(r: TaggableRow): Set<Tag> {
  // Pola dicocokkan ke NAMA saja; subkategori hanya lewat peta SUBCATEGORY_TAG (kata "Protein" di subkategori bukan bukti whey).
  const text = r.name.toLowerCase();
  const tags = new Set<Tag>();
  for (const [tag, re] of Object.entries(TAG_PATTERNS) as Array<[Tag, RegExp]>) if (re.test(text)) tags.add(tag);
  const sub = r.subcategory ? SUBCATEGORY_TAG[r.subcategory] : undefined;
  // Subkategori hanya menambah tag bila nama tidak menunjuk jenis lain (mis. "Crevolene" di subkategori Protein).
  const typed = (["protein", "gainer", "creatine", "amino", "preworkout", "fatburner", "electrolyte"] as Tag[]).some((t) => tags.has(t));
  if (sub && !typed) tags.add(sub);
  if (tags.has("gainer")) tags.delete("protein");
  if (tags.has("isolate") || tags.has("plant_protein")) tags.add("protein");
  return tags;
}

export function productForm(r: TaggableRow): Form | null {
  const t = `${r.name} ${r.size ?? ""} ${r.pack_count ?? ""}`.toLowerCase();
  if (/\b(capsules?|caps|softgels?|veg\s?caps?|kapsul)\b/.test(t)) return "kapsul";
  if (/\b(tablets?|caplets?|chewables?|tab)\b/.test(t)) return "tablet";
  if (/\b(gumm(y|ies)|sweets)\b/.test(t)) return "gummy";
  if (/\b(\d+\s?ml|rtd|drink|shot|liquid)\b/.test(t)) return "cair";
  if (/\b(\d+(\.\d+)?\s?(lbs?|kg|g|gr|gram)|sachets?|powder|scoops?|servings?)\b/.test(t)) return "bubuk";
  return null;
}

/** Jumlah sajian dari kolom servings, nama, ukuran, atau isi kemasan ("30 Servings", "12 Sachets"). */
export function parseServings(r: TaggableRow & { servings?: string | null }): number | null {
  const direct = Number(String(r.servings ?? "").replace(/[^\d]/g, ""));
  if (direct > 0) return direct;
  const m = `${r.name} ${r.size ?? ""} ${r.pack_count ?? ""}`.match(/(\d+)\s*(servings?|sajian|sachets?|sticks?)\b/i);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : null;
}

/** Produk yang TIDAK PERNAH direkomendasikan Vita (selain blocklist database). */
export const VITA_EXCLUDED_SUBCATEGORIES = new Set(["Performance & Testosterone", "Ibu & Anak", "Shaker & Botol", "Belt & Support", "Alat Latihan", "Otomotif & Gadget"]);
export const VITA_EXCLUDED_NAME =
  /\b(testo\w*|tribulus|tongkat\s?ali|anabolic|diuretic|dhea|yohimb\w*|sarms?|ostarine|ligandrol|cardarine|modafinil|armodafinil|ephedr\w*|dmaa|clenbuterol|steroid)\b/i;
const TOPICAL = /\b(serum|cream|krim|toner|lotion|cleanser|sunscreen|facial wash|masker|mask|salep|ointment|essence)\b/i;

export function isVitaExcluded(r: TaggableRow & { category?: string | null }, profile?: Pick<Profile, "normalized">): boolean {
  if (r.subcategory && VITA_EXCLUDED_SUBCATEGORIES.has(r.subcategory)) return true;
  if (r.category && /aksesoris|lain-lain/i.test(r.category)) return true;
  if (VITA_EXCLUDED_NAME.test(`${r.name} ${r.brand}`)) return true;
  // Produk anak tidak pernah direkomendasikan (pertanyaan tentang anak selalu diarahkan ke dokter).
  if (/\b(child\w*|kids?|anak|baby|bayi|toddler|junior)\b/i.test(r.name)) return true;
  // Produk oles (serum/krim) bukan suplemen: hanya bila pelanggan memintanya.
  if (TOPICAL.test(r.name) && !(profile && TOPICAL.test(profile.normalized))) return true;
  return false;
}
