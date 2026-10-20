// Tabel bukti terkurasi untuk takaran UMUM orang dewasa sehat. Vita HANYA boleh menyebut angka takaran dari:
// (1) kolom produk (dose/servings di label), atau (2) baris tabel ini beserta sumbernya. Selain itu: "ikuti label".
// Jangan menambah baris tanpa sumber primer (position stand ISSN / NIH Office of Dietary Supplements).
import type { Tag } from "./taxonomy";

export interface Evidence {
  tag: Tag;
  ingredient: string;
  /** Rentang umum dewasa sehat, bahasa Indonesia. */
  range: string;
  source: string;
}

export const EVIDENCE: Evidence[] = [
  {
    tag: "creatine",
    ingredient: "Creatine monohydrate",
    range: "3–5 g per hari (dosis pemeliharaan)",
    source: "Kreider dkk., ISSN position stand: creatine supplementation, J Int Soc Sports Nutr 2017",
  },
  {
    tag: "protein",
    ingredient: "Protein (total dari makanan + suplemen)",
    range: "1,4–2,0 g per kg berat badan per hari bagi orang yang rutin berolahraga",
    source: "Jäger dkk., ISSN position stand: protein and exercise, J Int Soc Sports Nutr 2017",
  },
  {
    tag: "vitc",
    ingredient: "Vitamin C",
    range: "kebutuhan dewasa 75–90 mg per hari; batas atas 2.000 mg per hari",
    source: "NIH Office of Dietary Supplements, Vitamin C Fact Sheet for Health Professionals",
  },
  {
    tag: "vitd",
    ingredient: "Vitamin D",
    range: "kebutuhan dewasa 600–800 IU (15–20 mcg) per hari; batas atas 4.000 IU per hari",
    source: "NIH Office of Dietary Supplements, Vitamin D Fact Sheet for Health Professionals",
  },
  {
    tag: "zinc",
    ingredient: "Zinc",
    range: "kebutuhan dewasa 8–11 mg per hari; batas atas 40 mg per hari",
    source: "NIH Office of Dietary Supplements, Zinc Fact Sheet for Health Professionals",
  },
  {
    tag: "magnesium",
    ingredient: "Magnesium",
    range: "kebutuhan dewasa 310–420 mg per hari dari semua sumber; batas atas dari suplemen 350 mg per hari",
    source: "NIH Office of Dietary Supplements, Magnesium Fact Sheet for Health Professionals",
  },
];

export function evidenceFor(tags: Iterable<Tag>): Evidence | null {
  const set = new Set(tags);
  return EVIDENCE.find((e) => set.has(e.tag)) ?? null;
}

/** Semua teks takaran yang sah dikutip (untuk validasi jawaban AI). */
export function allowedDoseTexts(productDoses: Array<string | null | undefined>): string[] {
  return [...EVIDENCE.map((e) => e.range), ...productDoses.filter((d): d is string => !!d)];
}
