// Penjaga keamanan Vita — dijalankan SEBELUM pencarian katalog dan sebelum model AI.
// Urutan: produk terlarang → kondisi medis berisiko → permintaan data internal/injeksi (dibuang, lalu lanjut normal).
import {
  isCostOrSecretProbe,
  isForbiddenText,
  looksLikeInjection,
  type HistoryItem,
} from "../../../supabase/functions/_shared/vitamin-finder-core";

const EXTRA_FORBIDDEN: RegExp[] = [
  /\btesto\w*\b/i,
  /\btestosteron\w*\b/i,
  /\btribulus\b/i,
  /\btongkat\s*ali\b/i,
  /\b(trenbolone|nandrolone|deca|dianabol|anavar|winstrol|oxandrolone|hgh|growth\s*hormone|peptida|bpc[\s-]?157)\b/i,
  /\b(sibutramin\w*|efedrin\w*|ephedr\w*|dnp|dmaa|phentermine)\b/i,
  /\b(obat\s*keras|resep\s*dokter|prescription)\b/i,
  /\b(viagra|sildenafil|tadalafil|cialis)\b/i,
];

export function isForbidden(text: string): boolean {
  return isForbiddenText(text) || EXTRA_FORBIDDEN.some((re) => re.test(text));
}

// Kondisi yang wajib diarahkan ke dokter/apoteker (tanpa saran dosis).
const MEDICAL: RegExp[] = [
  /\b(hamil|kehamilan|bumil|ibu hamil|promil|program hamil|menyusui|busui|ibu menyusui|pregnan\w*|breastfeed\w*)\b/i,
  /\b(anak|bayi|balita|batita|remaja|abg|smp|sd)\b/i,
  /\b(penyakit|diabetes|kencing\s*manis|gula\s*darah|hipertensi|darah\s*tinggi|tekanan\s*darah|jantung|ginjal|liver|hepatitis|kanker|tumor|tbc|asma|stroke|kolesterol|asam\s*urat|autoimun|lupus|epilepsi|kejang|tiroid|maag|asam\s*lambung|gerd|kemoterapi|cuci\s*darah|dialisis|depresi|bipolar|skizofrenia)\b/i,
  /\b(penyakit|fungsi|gangguan)\s+hati\b/i,
  /\bsakit\s+(kepala|perut|dada|ginjal|jantung|lambung)\b/i,
  /\b(gejala|diagnosis|diagnosa|menyembuhkan|mengobati|obati|alergi|efek\s*samping|overdosis|interaksi|operasi)\b/i,
  /\b(minum|konsumsi|makan|pakai|sedang|lagi|rutin)\s+obat\b/i,
  /\bobat\s+(resep|darah|diabetes|tekanan|pengencer|tidur|jantung|antidepresan|kolesterol)\b/i,
  /\b(pengencer\s*darah|warfarin|clopidogrel|metformin|insulin|antidepresan|ssri|kortikosteroid)\b/i,
];

function minorAge(text: string): boolean {
  const m = text.match(/\b(umur|usia|berumur)\s*(\d{1,2})\b/i) ?? text.match(/\b(\d{1,2})\s*(tahun|thn|th)\b/i);
  const n = m ? Number(m[2] && /\d/.test(m[2]) ? m[2] : m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 18;
}

export function isMedical(text: string): boolean {
  return MEDICAL.some((re) => re.test(text)) || minorAge(text);
}

const PROBE_STRIP: RegExp[] = [
  /\b(abaikan|lupakan|acuhkan|langgar|ignore|forget)\b[^,.?!]{0,60}/gi,
  /\b(kamu|anda)\s+sekarang\s+(adalah|jadi)\b[^,.?!]{0,40}/gi,
  /\byou\s+are\s+now\b[^,.?!]{0,40}/gi,
  /\b(tampilkan|tunjukkan|kasih|beri|sebutkan|show|print|reveal)\b[^,.?!]{0,20}\b(hpp|harga\s*(modal|pokok|beli\s*toko|kulak)|cost\s*price|system\s*prompt|prompt|instruksi|api[\s_-]?key|service[\s_-]?role)\b/gi,
  /\b(hpp|harga\s*(modal|pokok|beli\s*toko|kulak)|cost\s*price|system\s*prompt|prompt\s*(awal|sistem)|api[\s_-]?key|service[\s_-]?role)\b/gi,
  /\b(developer|dan|jailbreak)\s+mode\b/gi,
];

export type SafetyVerdict =
  | { kind: "forbidden" }
  | { kind: "medical" }
  | { kind: "probe"; cleaned: string }
  | { kind: "ok"; cleaned: string };

/** Medis memakai pesan sekarang + 2 pesan pelanggan sebelumnya (konteks kehamilan/obat tetap berlaku). Terlarang hanya pesan sekarang. */
export function routeSafety(message: string, history: HistoryItem[] = []): SafetyVerdict {
  if (isForbidden(message)) return { kind: "forbidden" };
  const recentUser = history.filter((h) => h.role === "user").slice(-2).map((h) => h.content);
  if (isMedical([...recentUser, message].join("\n"))) return { kind: "medical" };
  if (isCostOrSecretProbe(message) || looksLikeInjection(message)) {
    let cleaned = message;
    for (const re of PROBE_STRIP) cleaned = cleaned.replace(re, " ");
    return { kind: "probe", cleaned: cleaned.replace(/\s+/g, " ").replace(/^[\s,.;:!?-]+|[\s,;:-]+$/g, "").trim() };
  }
  return { kind: "ok", cleaned: message };
}

// ---------- Teks tetap (bahasa formal "Anda") ----------
export const DOCTOR_NOTE =
  "Karena menyangkut kondisi kesehatan, mohon konsultasikan dulu dengan dokter atau apoteker sebelum mengonsumsi suplemen apa pun.";
export const MEDICAL_REPLY = `${DOCTOR_NOTE} Admin cabang kami siap membantu lewat WhatsApp.`;
export const FORBIDDEN_REPLY =
  "Maaf, produk itu tidak kami jual karena termasuk obat keras, zat terlarang, atau produk hormon. Untuk kebutuhan medis, silakan konsultasi dengan dokter atau apoteker. Vita bisa bantu carikan pilihan yang aman, misalnya protein, multivitamin, atau elektrolit.";
export const PROBE_REPLY =
  "Maaf, Vita tidak bisa membagikan data internal toko seperti harga modal atau pengaturan sistem. Vita hanya membantu memilih produk dari katalog.";
export const FORBIDDEN_CHIPS = ["Protein", "Multivitamin", "Elektrolit"];
