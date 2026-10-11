// Pure, browser-safe rules for the Vita assistant (also unit-tested).

export const VITA_RATE_LIMIT = 20; // messages per visitor
export const VITA_RATE_WINDOW_MINUTES = 10;
export const VITA_MAX_MESSAGES = 30; // whole conversation (user + assistant)
export const VITA_MAX_CHARS = 800; // per user message
export const VITA_MAX_CARDS = 3;

// Mirrors the forbidden categories enforced in the database blocklist.
const FORBIDDEN = [
  /\bobat\s*keras\b/i,
  /\bresep\s*dokter\b/i,
  /\bsarms?\b/i,
  /\bostarine\b/i,
  /\bligandrol\b/i,
  /\brad[\s-]?140\b/i,
  /\bmk[\s-]?677\b/i,
  /\bmk[\s-]?2866\b/i,
  /\bcardarine\b/i,
  /\bgw[\s-]?501516\b/i,
  /\bmodafinil\b/i,
  /\barmodafinil\b/i,
  /\byohimb/i,
  /\bdhea\b/i,
];

export function isForbiddenRequest(text: string): boolean {
  return FORBIDDEN.some((re) => re.test(text));
}

export const FORBIDDEN_REPLY =
  "Maaf, produk itu tidak kami jual karena termasuk obat keras atau zat yang dilarang untuk dijual bebas. " +
  "Untuk kebutuhan medis, silakan konsultasi dengan dokter atau apoteker. Aku bisa bantu carikan suplemen yang aman, misalnya protein, vitamin, atau elektrolit.";

/** Finds a 48-hex order access token inside a pasted order link or message. */
export function extractOrderToken(text: string): string | null {
  const m = text.match(/\b([a-f0-9]{48})\b/i);
  return m ? m[1]!.toLowerCase() : null;
}

export function normalizeOrderNumber(text: string): string {
  return text.trim().toUpperCase().replace(/\s+/g, "");
}

export function vitaWhatsappUrl(summary: string): string {
  const text = `Halo VitaminKu, saya baru chat dengan Vita dan ingin dibantu admin.\n\nRingkasan: ${summary.slice(0, 400)}`;
  return `https://wa.me/6281339950000?text=${encodeURIComponent(text)}`;
}
