// Mesin Vita mode kata kunci (tanpa AI): keamanan → profil → katalog → peringkat adil → jawaban.
// Bentuk JSON sama dengan Rilis 2 (FinderOutput) + kolom tambahan opsional. Semua produk/harga berasal dari katalog.
import {
  makeIdempotencyKey,
  truncateReply,
  type FinderInput,
  type FinderOutput,
  type FinderProduct,
  type FinderStatus,
  type LogFn,
} from "../../../supabase/functions/_shared/vitamin-finder-core";
import { explain, rankCandidates, selectFair, namedBrands, type CatalogRow, type Ranked, type VitaProductExtras } from "./rank";
import {
  DOCTOR_NOTE,
  FORBIDDEN_CHIPS,
  FORBIDDEN_REPLY,
  MEDICAL_REPLY,
  PROBE_REPLY,
  routeSafety,
} from "./safety";
import {
  GOALS,
  SUBCATEGORY_TAG,
  TAG_SEARCH,
  TAXONOMY_VERSION,
  goalById,
  parseProfile,
  type GoalId,
  type Profile,
  type Tag,
} from "./taxonomy";

export interface CatalogQuery {
  keywords: string[];
  subcategories: string[];
  maxPrice: number | null;
  limit: number;
}
export type CatalogSearch = (q: CatalogQuery) => Promise<CatalogRow[]>;

export type VitaProduct = FinderProduct & Partial<VitaProductExtras>;
export interface VitaResult {
  reply_text: string;
  product_ids: string[];
  products?: VitaProduct[];
  goal?: GoalId | null;
  mode?: "keyword" | "ai";
  quick_replies?: string[];
  query_hash?: string;
  taxonomy_version?: string;
  whatsapp?: boolean;
}
export type VitaOutput = Omit<FinderOutput, "result"> & { result: VitaResult };

export interface VitaEvent {
  query_hash: string;
  query_text: string | null;
  detected_goal: GoalId | null;
  zero_result: boolean;
  mode: "keyword" | "ai";
}
export interface KeywordDeps {
  search: CatalogSearch;
  log?: LogFn;
  onEvent?: (e: VitaEvent) => void;
}

export const ASK_GOAL_REPLY =
  'Halo, saya Vita. Ceritakan tujuan Anda, nanti Vita pilihkan 3 produk dari katalog. Contoh: "tambah otot budget 500 ribu", "susah tidur", "daya tahan tubuh", atau "whey untuk pemula".';
export const DEFAULT_CHIPS = ["Budget < 300rb", "Bubuk", "Kapsul", "Tanpa kafein"];
const GOAL_CHIPS = ["Tambah otot", "Daya tahan tubuh", "Susah tidur", "Program diet"];

const fmtIdr = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

/** Hash kueri (bukan isi pesan): untuk statistik & cache, tanpa data pribadi. */
export function queryHash(normalized: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  for (let i = 0; i < normalized.length; i++) {
    h1 = Math.imul(h1 ^ normalized.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ normalized.charCodeAt(i), 0x5bd1e995) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/** Teks kueri hanya disimpan untuk kueri tanpa hasil, setelah data pribadi (angka panjang, email, nama) dibuang. */
export function scrubQuery(normalized: string): string {
  return normalized
    .replace(/\S+@\S+/g, " ")
    .replace(/\b\d{5,}\b/g, " ")
    .replace(/\b(nama saya|namaku|nama)\s+\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function vitaEnvelope(key: string, status: FinderStatus, reply: string, over: Partial<VitaResult> & { confidence: number; needs_human: boolean; reason?: string }): VitaOutput {
  const { confidence, needs_human, reason, products = [], ...extra } = over;
  const list = products.slice(0, 3);
  const out: VitaOutput = {
    status,
    idempotency_key: key,
    result: { ...extra, reply_text: truncateReply(reply), product_ids: list.map((p) => p.id), products: list, taxonomy_version: TAXONOMY_VERSION },
    confidence,
    needs_human,
  };
  if (reason) out.reason = reason;
  return out;
}

const TAG_GOAL: Partial<Record<Tag, GoalId>> = {
  protein: "protein",
  isolate: "protein",
  plant_protein: "protein",
  gainer: "massa",
  creatine: "kreatin",
  amino: "amino",
  preworkout: "pre_workout",
  fatburner: "diet",
  electrolyte: "elektrolit",
  multivitamin: "multivit",
  omega: "omega",
  collagen: "kolagen",
  vitc: "vitc",
  vitd: "vitd",
  zinc: "zinc",
  magnesium: "magnesium",
  melatonin: "tidur",
  ashwagandha: "ashwagandha",
  theanine: "stres",
  probiotic: "pencernaan",
  joint: "sendi",
};

export function buildCatalogQuery(profile: Profile, goals: GoalId[] = profile.goals): CatalogQuery {
  const tags = new Set<Tag>(goals.flatMap((g) => goalById(g).tags));
  const keywords = new Set<string>();
  for (const t of tags) for (const k of TAG_SEARCH[t]) keywords.add(k);
  for (const t of profile.terms) keywords.add(t);
  const subcategories = Object.entries(SUBCATEGORY_TAG)
    .filter(([, tag]) => tags.has(tag))
    .map(([sub]) => sub);
  return { keywords: [...keywords].slice(0, 24), subcategories, maxPrice: profile.budget, limit: 300 };
}

export function toProduct(r: Ranked, medicalContext = false, highlight = ""): FinderProduct & VitaProductExtras {
  const ex = explain(r, { medicalContext });
  return {
    id: r.row.id,
    name: r.row.name,
    brand: r.row.brand,
    price: r.row.price,
    size: r.row.size,
    image: r.row.image,
    slug: r.row.slug,
    ...ex,
    reason: highlight ? `${highlight} ${ex.reason}` : ex.reason,
  };
}

/** Pembeda jujur antar-kartu dari data katalog (bukan klaim): merek dicari, termurah, paling hemat per sajian, isi terbanyak. */
export function highlights(picked: Ranked[]): string[] {
  const out = picked.map(() => "");
  if (picked.length < 2) return picked.map((p) => (p.brandNamed ? "Merek yang Anda cari." : ""));
  const set = (i: number, text: string) => {
    if (i >= 0 && !out[i]) out[i] = text;
  };
  picked.forEach((p, i) => p.brandNamed && set(i, "Merek yang Anda cari."));
  const withCps = picked.map((p, i) => [p.costPerServing, i] as const).filter(([c]) => c !== null) as Array<readonly [number, number]>;
  if (withCps.length >= 2) set(withCps.sort((a, b) => a[0] - b[0])[0]![1], "Paling hemat per sajian di antara pilihan ini.");
  const cheapest = picked.map((p, i) => [p.row.price, i] as const).sort((a, b) => a[0] - b[0])[0]![1];
  set(cheapest, "Harga paling terjangkau di antara pilihan ini.");
  const withServ = picked.map((p, i) => [p.servings, i] as const).filter(([s]) => s !== null) as Array<readonly [number, number]>;
  if (withServ.length >= 2) set(withServ.sort((a, b) => b[0] - a[0])[0]![1], "Isi paling banyak per kemasan.");
  return out;
}

export interface Retrieval {
  profile: Profile;
  goals: GoalId[];
  ranked: Ranked[];
  picked: Ranked[];
}

/** Ambil kandidat katalog lalu pilih 3 secara adil. Merek saja ("muscletech") → tujuan disimpulkan dari produk terbaik merek itu. */
export async function retrieve(profile: Profile, search: CatalogSearch, goals: GoalId[] = profile.goals): Promise<Retrieval> {
  let rows = await search(buildCatalogQuery(profile, goals));
  let ranked = rankCandidates(rows, profile, { goals });
  if (!goals.length && namedBrands(profile, rows).length) {
    // Jenis produk yang paling banyak dijual merek itu (mis. MuscleTech → protein), bukan satu produk acak.
    const count = new Map<GoalId, number>();
    for (const r of ranked.filter((x) => x.brandNamed))
      for (const t of r.tags) {
        const g = TAG_GOAL[t];
        if (g) count.set(g, (count.get(g) ?? 0) + 1);
      }
    const inferred = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    if (inferred) {
      goals = [inferred];
      rows = [...rows, ...(await search(buildCatalogQuery({ ...profile, terms: [] }, goals)))];
      ranked = rankCandidates(rows, profile, { goals });
    }
  }
  return { profile, goals, ranked, picked: selectFair(ranked, profile) };
}

function intro(profile: Profile, goals: GoalId[], picked: Ranked[]): string {
  const brands = new Set(picked.map((p) => p.row.brand)).size;
  const named = picked.filter((p) => p.brandNamed).map((p) => p.row.brand);
  if (profile.compare && named.length >= 2) return `Perbandingan ${[...new Set(named)].join(" dan ")} di katalog kami`;
  if (named.length) return `Pilihan ${named[0]} terbaik untuk Anda, plus ${picked.length - 1} alternatif merek lain sebagai pembanding`;
  const label =
    profile.noCaffeine && profile.goals.includes("pre_workout")
      ? "persiapan latihan tanpa kafein"
      : goals.length
        ? goals.slice(0, 2).map((g) => goalById(g).label).join(" & ")
        : "pencarian Anda";
  return `Untuk ${label}, ini ${picked.length} pilihan dari ${brands} merek berbeda di katalog kami`;
}

export function composeReply(profile: Profile, goals: GoalId[], picked: Ranked[], prefix = ""): string {
  const lines = picked.map((p, i) => {
    const per = p.costPerServing ? ` (± ${fmtIdr(p.costPerServing)}/sajian)` : "";
    return `${i + 1}. ${p.row.name} — ${fmtIdr(p.row.price)}${per}`;
  });
  const notes: string[] = [];
  if (profile.budget) notes.push(`Semua di bawah budget ${fmtIdr(profile.budget)}.`);
  if (profile.noCaffeine && profile.goals.includes("pre_workout"))
    notes.push("Pre-workout di katalog kami umumnya mengandung kafein, jadi Vita pilihkan alternatif tanpa pre-workout.");
  for (const g of goals) {
    const note = goalById(g).note;
    if (note && !notes.includes(note)) notes.push(note);
  }
  const head = `${prefix ? `${prefix} ` : ""}${intro(profile, goals, picked)}:`;
  const tail = "Ketuk kartu untuk tambah ke keranjang atau bandingkan.";
  const full = [head, ...lines, ...notes, tail].join("\n");
  return full.length <= 700 ? full : [head, ...lines, ...notes].join("\n");
}

/** Mode kata kunci (selalu tersedia, tanpa kunci AI). */
export async function runVitaKeyword(input: FinderInput, deps: KeywordDeps): Promise<VitaOutput> {
  const key = makeIdempotencyKey(input.session_id, input.message, input.history.length);
  const safety = routeSafety(input.message, input.history);
  if (safety.kind === "forbidden")
    return vitaEnvelope(key, "ok", FORBIDDEN_REPLY, { confidence: 1, needs_human: true, reason: "forbidden_product", quick_replies: FORBIDDEN_CHIPS, whatsapp: true, goal: null, mode: "keyword" });
  if (safety.kind === "medical")
    return vitaEnvelope(key, "ok", MEDICAL_REPLY, { confidence: 1, needs_human: true, reason: "medical", whatsapp: true, goal: null, mode: "keyword" });

  const probe = safety.kind === "probe";
  const profile = parseProfile(safety.cleaned, input.history);
  const qh = queryHash(profile.normalized);
  const event = (goal: GoalId | null, zero: boolean) =>
    deps.onEvent?.({ query_hash: qh, query_text: zero ? scrubQuery(profile.normalized) || null : null, detected_goal: goal, zero_result: zero, mode: "keyword" });

  if (!profile.goals.length && !profile.terms.length) {
    if (probe) return vitaEnvelope(key, "ok", `${PROBE_REPLY} Mau cari suplemen apa?`, { confidence: 1, needs_human: false, reason: "internal_data_request", quick_replies: GOAL_CHIPS, goal: null, mode: "keyword", query_hash: qh });
    event(null, true);
    return vitaEnvelope(key, "needs_input", ASK_GOAL_REPLY, { confidence: 0.5, needs_human: false, reason: "goal_unclear", quick_replies: GOAL_CHIPS, goal: null, mode: "keyword", query_hash: qh });
  }

  let r: Retrieval;
  try {
    r = await retrieve(profile, deps.search, goalsFor(profile));
  } catch (e) {
    deps.log?.({ agent: "vita", event: "catalog_search_failed", error: e instanceof Error ? e.message.slice(0, 80) : "unknown" });
    return vitaEnvelope(key, "error", "Maaf, katalog sedang tidak bisa dibaca. Silakan tanya admin cabang lewat WhatsApp.", { confidence: 0, needs_human: true, reason: "catalog_unavailable", whatsapp: true, mode: "keyword" });
  }
  const goal = r.goals[0] ?? null;
  if (!r.picked.length) {
    event(goal, true);
    const reply = profile.budget
      ? `Belum ada produk yang cocok dengan budget ${fmtIdr(profile.budget)}. Coba naikkan sedikit budget-nya, atau tanya admin cabang lewat WhatsApp.`
      : "Vita belum menemukan produk itu di katalog. Coba sebutkan jenisnya (misal whey, creatine, vitamin C) atau tujuan Anda (misal tambah otot, tidur nyenyak).";
    return vitaEnvelope(key, "needs_input", probe ? `${PROBE_REPLY} ${reply}` : reply, {
      confidence: 0.4,
      needs_human: false,
      reason: probe ? "internal_data_request" : "no_matching_product",
      quick_replies: profile.budget ? ["Naikkan budget", "Tanya admin"] : GOAL_CHIPS,
      goal,
      mode: "keyword",
      query_hash: qh,
      whatsapp: true,
    });
  }
  event(goal, false);
  const hl = highlights(r.picked);
  const products = r.picked.map((p, i) => toProduct(p, false, hl[i]));
  const reply = composeReply(profile, r.goals, r.picked, probe ? PROBE_REPLY : "");
  return vitaEnvelope(key, "ok", reply, {
    products,
    confidence: 0.75,
    needs_human: false,
    reason: probe ? "internal_data_request" : "keyword_mode",
    quick_replies: chipsFor(profile),
    goal,
    mode: "keyword",
    query_hash: qh,
  });
}

/** Tanpa kafein + pre-workout: pre-workout di katalog umumnya berkafein → alihkan ke amino, creatine, elektrolit. */
export function goalsFor(profile: Profile): GoalId[] {
  if (profile.noCaffeine && profile.goals.includes("pre_workout"))
    return [...new Set<GoalId>(["amino", "kreatin", "elektrolit", ...profile.goals.filter((g) => g !== "pre_workout")])];
  return profile.goals;
}

export function chipsFor(profile: Profile): string[] {
  const chips = [...DEFAULT_CHIPS];
  if (profile.budget) chips.splice(0, 1, "Lebih hemat");
  if (profile.form === "bubuk") chips.splice(chips.indexOf("Bubuk"), 1);
  if (profile.form === "kapsul") chips.splice(chips.indexOf("Kapsul"), 1);
  if (profile.noCaffeine) chips.splice(chips.indexOf("Tanpa kafein"), 1);
  return chips.slice(0, 4);
}

export const ALL_GOALS = GOALS.map((g) => g.id);
export { DOCTOR_NOTE };
