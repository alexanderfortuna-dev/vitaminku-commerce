// Unduh gambar dari URL luar dengan penjagaan SSRF. Hanya dipakai di server.
// Dependensi (fetch, DNS) bisa disuntik supaya bisa diuji tanpa jaringan sungguhan.
import {
  IMAGE_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
  MAX_REDIRECTS,
  checkDownloadUrl,
  declaredLength,
  isPublicAddress,
  normalizeImageType,
  resolveRedirect,
  sniffImageType,
  type AllowedImageType,
} from "./image-fetch-guard";

export interface DownloadDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Mengembalikan semua alamat IP untuk sebuah nama host. */
  resolve: (hostname: string) => Promise<string[]>;
}

export async function defaultResolve(hostname: string): Promise<string[]> {
  const net = await import("node:net");
  if (net.isIP(hostname.replace(/^\[|\]$/g, ""))) return [hostname.replace(/^\[|\]$/g, "")];
  const { lookup } = await import("node:dns/promises");
  const out = await lookup(hostname, { all: true, verbatim: true });
  return out.map((a) => a.address);
}

const defaultDeps = (): DownloadDeps => ({
  fetch: (url, init) => fetch(url, init),
  resolve: defaultResolve,
});

async function assertPublicHost(hostname: string, deps: DownloadDeps) {
  let addrs: string[];
  try {
    addrs = await deps.resolve(hostname);
  } catch {
    throw new Error("alamat tidak ditemukan (DNS)");
  }
  if (addrs.length === 0) throw new Error("alamat tidak ditemukan (DNS)");
  if (!addrs.every(isPublicAddress)) throw new Error("alamat internal tidak diizinkan");
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > max) throw new Error("gambar > 8 MB");
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new Error("gambar > 8 MB");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * Hanya http(s); tolak host privat/loopback/link-local (termasuk lewat DNS dan pengalihan);
 * maks 8 MB; timeout 10 detik untuk seluruh unduhan; tipe harus jpeg/png/webp (header DAN byte).
 */
export async function downloadPublicImage(
  rawUrl: string,
  deps: DownloadDeps = defaultDeps(),
): Promise<{ bytes: Uint8Array; type: AllowedImageType }> {
  const first = checkDownloadUrl(rawUrl);
  if (!first.ok) throw new Error(first.reason);
  const signal = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
  let current = first.url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current.hostname, deps);
    let res: Response;
    try {
      res = await deps.fetch(current.toString(), {
        signal,
        redirect: "manual",
        headers: { accept: "image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.1" },
      });
    } catch (e) {
      if (signal.aborted) throw new Error("waktu habis (10 detik)");
      throw new Error(e instanceof Error && e.message ? `gagal terhubung (${e.message.slice(0, 60)})` : "gagal terhubung");
    }
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => undefined);
      const next = resolveRedirect(current, res.headers.get("location"));
      if (!next.ok) throw new Error(`pengalihan ditolak (${next.reason})`);
      current = next.url;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new Error(`HTTP ${res.status}`);
    }
    const headerType = normalizeImageType(res.headers.get("content-type"));
    if (!headerType) {
      await res.body?.cancel().catch(() => undefined);
      throw new Error(`bukan gambar jpeg/png/webp (${(res.headers.get("content-type") ?? "tanpa tipe").slice(0, 40)})`);
    }
    const declared = declaredLength(res.headers.get("content-length"));
    if (declared !== null && declared > MAX_IMAGE_BYTES) {
      await res.body?.cancel().catch(() => undefined);
      throw new Error("gambar > 8 MB");
    }
    let bytes: Uint8Array;
    try {
      bytes = await readCapped(res, MAX_IMAGE_BYTES);
    } catch (e) {
      if (signal.aborted) throw new Error("waktu habis (10 detik)");
      throw e;
    }
    if (bytes.byteLength < 200) throw new Error("gambar kosong");
    const real = sniffImageType(bytes);
    if (!real) throw new Error("isi berkas bukan gambar jpeg/png/webp");
    return { bytes, type: real };
  }
  throw new Error("terlalu banyak pengalihan");
}
