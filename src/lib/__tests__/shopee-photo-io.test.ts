// Uji unduhan & pemrosesan foto TANPA jaringan sungguhan: fetch dan DNS diganti tiruan.
import { describe, expect, it, vi } from "vitest";
import { downloadPublicImage, type DownloadDeps } from "../image-download.server";
import { processToWebp } from "../photo-process.server";

const JPEG = (() => {
  const b = new Uint8Array(400);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
})();

const ok = (body: Uint8Array | string, type = "image/jpeg", extra: Record<string, string> = {}) =>
  new Response(body as BodyInit, { status: 200, headers: { "content-type": type, ...extra } });
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

function deps(handler: (url: string) => Response | Promise<Response>, ips: Record<string, string[]> = {}): DownloadDeps & {
  fetch: ReturnType<typeof vi.fn>;
} {
  return {
    fetch: vi.fn(async (url: string) => handler(url)),
    resolve: async (host: string) => ips[host] ?? ["93.184.216.34"],
  } as never;
}

describe("downloadPublicImage — penjagaan SSRF (tanpa jaringan)", () => {
  it("mengunduh gambar publik", async () => {
    const d = deps(() => ok(JPEG));
    const r = await downloadPublicImage("https://cdn.example.com/a.jpg", d);
    expect(r.type).toBe("image/jpeg");
    expect(r.bytes.byteLength).toBe(400);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it("tidak pernah memanggil fetch untuk host/skema berbahaya", async () => {
    const d = deps(() => ok(JPEG));
    for (const u of ["http://127.0.0.1/a.jpg", "http://169.254.169.254/", "file:///etc/passwd", "https://localhost/a", "http://[::1]/a"]) {
      await expect(downloadPublicImage(u, d)).rejects.toThrow();
    }
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("nama publik yang DNS-nya menunjuk ke IP internal ditolak sebelum fetch", async () => {
    const d = deps(() => ok(JPEG), { "evil.example.com": ["10.0.0.7"], "mix.example.com": ["93.184.216.34", "127.0.0.1"] });
    await expect(downloadPublicImage("https://evil.example.com/a.jpg", d)).rejects.toThrow(/internal/);
    await expect(downloadPublicImage("https://mix.example.com/a.jpg", d)).rejects.toThrow(/internal/);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("pengalihan ke alamat internal ditolak", async () => {
    const d = deps((url) => (url.startsWith("https://cdn.example.com") ? redirect("http://169.254.169.254/latest/meta-data/") : ok(JPEG)));
    await expect(downloadPublicImage("https://cdn.example.com/a.jpg", d)).rejects.toThrow(/pengalihan ditolak/);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it("pengalihan ke host yang DNS-nya internal ditolak", async () => {
    const d = deps((url) => (url.includes("cdn.example.com") ? redirect("https://rebind.example.com/x.jpg") : ok(JPEG)), {
      "rebind.example.com": ["192.168.1.10"],
    });
    await expect(downloadPublicImage("https://cdn.example.com/a.jpg", d)).rejects.toThrow(/internal/);
  });

  it("pengalihan publik diikuti, tetapi maks 3 kali", async () => {
    const good = deps((url) => (url.endsWith("/a.jpg") ? redirect("/b.jpg") : ok(JPEG)));
    await expect(downloadPublicImage("https://cdn.example.com/a.jpg", good)).resolves.toBeTruthy();
    const loop = deps(() => redirect("https://cdn.example.com/again.jpg"));
    await expect(downloadPublicImage("https://cdn.example.com/a.jpg", loop)).rejects.toThrow(/terlalu banyak pengalihan/);
    expect(loop.fetch).toHaveBeenCalledTimes(4);
  });

  it("menolak tipe selain jpeg/png/webp (header)", async () => {
    for (const t of ["image/gif", "image/svg+xml", "text/html", "application/octet-stream"]) {
      await expect(downloadPublicImage("https://cdn.example.com/a", deps(() => ok(JPEG, t)))).rejects.toThrow(/bukan gambar/);
    }
  });

  it("menolak isi yang berpura-pura gambar (byte tidak cocok)", async () => {
    const html = new TextEncoder().encode("<html>".padEnd(400, " "));
    await expect(downloadPublicImage("https://cdn.example.com/a.jpg", deps(() => ok(html)))).rejects.toThrow(/isi berkas/);
  });

  it("menolak > 8 MB lewat Content-Length tanpa membaca isi", async () => {
    const d = deps(() => ok(JPEG, "image/jpeg", { "content-length": String(9 * 1024 * 1024) }));
    await expect(downloadPublicImage("https://cdn.example.com/a.jpg", d)).rejects.toThrow(/8 MB/);
  });

  it("menolak > 8 MB walau server berbohong soal ukuran (dibaca bertahap)", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    chunk.set([0xff, 0xd8, 0xff]);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (sent++ >= 12) return ctrl.close();
        ctrl.enqueue(chunk);
      },
    });
    const d = deps(() => new Response(stream, { status: 200, headers: { "content-type": "image/jpeg" } }));
    await expect(downloadPublicImage("https://cdn.example.com/a.jpg", d)).rejects.toThrow(/8 MB/);
    expect(sent).toBeLessThan(12); // berhenti sebelum semua terbaca
  });

  it("HTTP error dan DNS gagal dilaporkan dengan jelas", async () => {
    await expect(downloadPublicImage("https://cdn.example.com/a.jpg", deps(() => new Response("x", { status: 404 })))).rejects.toThrow("HTTP 404");
    const d = { fetch: vi.fn(), resolve: async () => { throw new Error("ENOTFOUND"); } } as unknown as DownloadDeps;
    await expect(downloadPublicImage("https://nope.example.com/a.jpg", d)).rejects.toThrow(/DNS/);
  });
});

describe("processToWebp — dua ukuran WebP", () => {
  async function makeImage(width: number, height: number, format: "jpeg" | "png" = "jpeg") {
    const sharp = (await import("sharp")).default;
    const img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } });
    return new Uint8Array(await (format === "jpeg" ? img.jpeg() : img.png()).toBuffer());
  }
  const isWebp = (b: Uint8Array) =>
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";

  it("1600x1200 → 800x600 dan thumbnail 400x300", async () => {
    const r = await processToWebp(await makeImage(1600, 1200));
    expect(isWebp(r.main) && isWebp(r.thumb)).toBe(true);
    expect(r.mainSize).toEqual({ width: 800, height: 600 });
    expect(r.thumbSize).toEqual({ width: 400, height: 300 });
  });

  it("gambar kecil tidak diperbesar", async () => {
    const r = await processToWebp(await makeImage(300, 500, "png"));
    expect(r.mainSize).toEqual({ width: 300, height: 500 });
    expect(r.thumbSize).toEqual({ width: 300, height: 500 });
  });

  it("gambar rusak ditolak dengan pesan Indonesia", async () => {
    await expect(processToWebp(new Uint8Array(500).fill(7))).rejects.toThrow(/tidak bisa diproses/);
  });
});
