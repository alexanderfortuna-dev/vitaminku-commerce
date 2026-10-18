// Penjaga unduhan gambar dari URL luar (anti-SSRF). Fungsi murni: tanpa jaringan, bisa diuji.
// Server memakai ini sebelum fetch, dan lagi untuk SETIAP alamat IP hasil DNS serta setiap pengalihan (redirect).

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const IMAGE_TIMEOUT_MS = 10_000; // 10 detik
export const MAX_REDIRECTS = 3;
export const MAX_URL_LENGTH = 1000;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Alamat IPv4 bertitik ("a.b.c.d") yang bukan alamat internet publik. */
export function isPrivateIpv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return true; // bentuk aneh = tolak
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if ([a, b, c, Number(m[4])].some((n) => n > 255)) return true;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + metadata cloud
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224) return true; // multicast + cadangan + broadcast
  return false;
}

/** Alamat IPv6 (tanpa tanda kurung). Alamat IPv4-mapped diperiksa sebagai IPv4. */
export function isPrivateIpv6(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "").toLowerCase().split("%")[0]!;
  if (!/^[0-9a-f:.]+$/.test(ip) || !ip.includes(":")) return true;
  // IPv4 tertanam dalam bentuk heksa: ::ffff:7f00:1 atau bertitik ::ffff:127.0.0.1
  const dotted = /(?:^|:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip);
  if (dotted) {
    const prefix = ip.slice(0, ip.length - dotted[1]!.length);
    const mapped = prefix === "::" || prefix === "::ffff:" || /^(0{1,4}:){5}(ffff:|0{1,4}:)$/.test(prefix);
    return mapped ? isPrivateIpv4(dotted[1]!) : true; // bentuk lain dengan ekor bertitik = tolak
  }
  const groups = expandIpv6(ip);
  if (!groups) return true;
  if (groups.every((g) => g === 0)) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  const embedded = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // ::ffff:a.b.c.d (IPv4-mapped) dan ::a.b.c.d (IPv4-compatible)
  if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    return isPrivateIpv4(embedded(groups[6]!, groups[7]!));
  }
  // 64:ff9b::/96 (NAT64)
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    return isPrivateIpv4(embedded(groups[6]!, groups[7]!));
  }
  const first = groups[0]!;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (usang)
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x2001 && groups[1] === 0x0db8) return true; // dokumentasi
  if (first === 0x2002) return true; // 6to4 (bisa membungkus IPv4 internal)
  return false;
}

function expandIpv6(ip: string): number[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string) => (s === "" ? [] : s.split(":"));
  const head = parse(halves[0]!);
  const tail = halves.length === 2 ? parse(halves[1]!) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill("0"), ...tail];
  if (all.length !== 8) return null;
  const nums = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.some((n) => Number.isNaN(n)) ? null : nums;
}

/** Alamat IP hasil DNS (v4 atau v6) → true bila publik dan aman diunduh. */
export function isPublicAddress(address: string): boolean {
  const a = address.trim();
  if (a.includes(":")) return !isPrivateIpv6(a);
  return !isPrivateIpv4(a);
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".home.arpa", ".localdomain"];

/** Nama host yang jelas internal. Host berupa IP diperiksa langsung. */
export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h.startsWith("[")) return isPrivateIpv6(h);
  if (/^[0-9.]+$/.test(h)) return isPrivateIpv4(h); // URL() sudah menormalkan bentuk desimal/heksa/oktal ke a.b.c.d
  if (h === "localhost" || h === "metadata" || h === "metadata.google.internal") return true;
  if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return true;
  if (!h.includes(".")) return true; // nama pendek tanpa titik = jaringan internal
  return false;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Bentuk URL yang boleh diunduh server: http(s), tanpa user:pass, port standar, bukan host internal.
 * (DNS tetap harus diperiksa terpisah lewat isPublicAddress karena nama publik bisa menunjuk ke IP internal.)
 */
export function checkDownloadUrl(input: string, opts: { httpsOnly?: boolean } = {}): UrlCheck {
  const s = String(input ?? "").trim();
  if (!s) return { ok: false, reason: "URL kosong" };
  if (s.length > MAX_URL_LENGTH) return { ok: false, reason: "URL terlalu panjang" };
  if (/^data:/i.test(s)) return { ok: false, reason: "data: tidak diizinkan" };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, reason: "URL tidak valid" };
  }
  if (u.protocol !== "https:" && (opts.httpsOnly || u.protocol !== "http:")) {
    return { ok: false, reason: opts.httpsOnly ? "harus https" : "hanya http/https" };
  }
  if (u.username || u.password) return { ok: false, reason: "URL berisi user/password" };
  if (u.port && u.port !== "80" && u.port !== "443") return { ok: false, reason: "port tidak diizinkan" };
  if (isPrivateHostname(u.hostname)) return { ok: false, reason: "alamat internal tidak diizinkan" };
  return { ok: true, url: u };
}

/** Pengalihan: URL tujuan relatif terhadap URL sekarang, lalu diperiksa ulang. */
export function resolveRedirect(current: URL, location: string | null): UrlCheck {
  if (!location) return { ok: false, reason: "pengalihan tanpa tujuan" };
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    return { ok: false, reason: "tujuan pengalihan tidak valid" };
  }
  return checkDownloadUrl(next.toString());
}

/** "image/JPEG; charset=x" → "image/jpeg"; null bila bukan jpeg/png/webp. */
export function normalizeImageType(contentType: string | null | undefined): AllowedImageType | null {
  const t = String(contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (t === "image/jpg" || t === "image/pjpeg") return "image/jpeg";
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(t) ? (t as AllowedImageType) : null;
}

/** Tipe sebenarnya dari byte awal (header bisa berbohong). */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Content-Length yang dinyatakan server; null bila tidak ada/tidak valid. */
export function declaredLength(header: string | null | undefined): number | null {
  if (header == null || !/^\d+$/.test(header.trim())) return null;
  return Number(header);
}

export function isTooLarge(bytes: number, max = MAX_IMAGE_BYTES): boolean {
  return bytes > max;
}
