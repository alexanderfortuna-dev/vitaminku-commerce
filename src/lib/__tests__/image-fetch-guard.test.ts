import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  checkDownloadUrl,
  declaredLength,
  isPrivateHostname,
  isPrivateIpv4,
  isPrivateIpv6,
  isPublicAddress,
  isTooLarge,
  normalizeImageType,
  resolveRedirect,
  sniffImageType,
} from "../image-fetch-guard";

describe("SSRF — alamat IPv4", () => {
  it.each([
    "127.0.0.1", "127.255.255.254", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255", "192.0.0.8", "198.18.0.1",
  ])("%s = internal", (ip) => expect(isPrivateIpv4(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "104.18.20.30", "203.0.113.9"])("%s = publik", (ip) =>
    expect(isPrivateIpv4(ip)).toBe(false),
  );

  it("bentuk aneh ditolak", () => {
    expect(isPrivateIpv4("999.1.1.1")).toBe(true);
    expect(isPrivateIpv4("1.2.3")).toBe(true);
  });
});

describe("SSRF — alamat IPv6", () => {
  it.each([
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1",
    "::ffff:10.0.0.1", "[::1]", "64:ff9b::7f00:1", "2002:7f00:1::1", "2001:db8::1",
  ])("%s = internal", (ip) => expect(isPrivateIpv6(ip)).toBe(true));

  it.each(["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"])("%s = publik", (ip) =>
    expect(isPrivateIpv6(ip)).toBe(false),
  );

  it("isPublicAddress memilih v4/v6", () => {
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("10.1.1.1")).toBe(false);
    expect(isPublicAddress("fe80::1")).toBe(false);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
});

describe("SSRF — nama host", () => {
  it.each([
    "localhost", "LOCALHOST.", "app.localhost", "printer.local", "db.internal", "metadata.google.internal",
    "intranet", "router.lan", "nas.home.arpa", "", "127.0.0.1", "[::1]",
  ])("%s ditolak", (h) => expect(isPrivateHostname(h)).toBe(true));

  it.each(["down-id.img.susercontent.com", "cf.shopee.co.id", "example.com"])("%s boleh", (h) =>
    expect(isPrivateHostname(h)).toBe(false),
  );
});

describe("checkDownloadUrl", () => {
  it("menerima https publik", () => {
    const r = checkDownloadUrl("https://down-id.img.susercontent.com/file/abc");
    expect(r.ok).toBe(true);
  });

  it("http hanya bila tidak httpsOnly", () => {
    expect(checkDownloadUrl("http://cdn.example.com/a.jpg").ok).toBe(true);
    expect(checkDownloadUrl("http://cdn.example.com/a.jpg", { httpsOnly: true })).toMatchObject({ ok: false, reason: "harus https" });
  });

  it.each([
    "file:///etc/passwd", "ftp://example.com/a.jpg", "gopher://example.com", "javascript:alert(1)",
    "data:image/png;base64,AAAA", "DATA:image/png;base64,AAAA", "", "bukan url",
  ])("skema/bentuk berbahaya ditolak: %s", (u) => expect(checkDownloadUrl(u).ok).toBe(false));

  it.each([
    "https://localhost/a.jpg",
    "https://127.0.0.1/a.jpg",
    "http://2130706433/a.jpg", // desimal = 127.0.0.1
    "http://0x7f.0.0.1/a.jpg", // heksa
    "http://017700000001/a.jpg", // oktal
    "http://127.1/a.jpg", // singkat
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/a.jpg",
    "http://[::ffff:127.0.0.1]/a.jpg",
    "https://10.0.0.8/a.jpg",
    "https://192.168.0.1/a.jpg",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://kantor.local/a.jpg",
  ])("host internal ditolak: %s", (u) => {
    const r = checkDownloadUrl(u);
    expect(r.ok).toBe(false);
  });

  it("user:pass, port aneh, dan URL terlalu panjang ditolak", () => {
    expect(checkDownloadUrl("https://user:pw@example.com/a.jpg").ok).toBe(false);
    expect(checkDownloadUrl("https://example.com:6379/a.jpg").ok).toBe(false);
    expect(checkDownloadUrl("https://example.com:443/a.jpg").ok).toBe(true);
    expect(checkDownloadUrl(`https://example.com/${"a".repeat(1000)}`).ok).toBe(false);
  });

  it("pengalihan diperiksa ulang: relatif ke tujuan publik boleh, ke internal ditolak", () => {
    const cur = new URL("https://cdn.example.com/a/b.jpg");
    expect(resolveRedirect(cur, "/c.jpg").ok).toBe(true);
    expect(resolveRedirect(cur, "http://169.254.169.254/").ok).toBe(false);
    expect(resolveRedirect(cur, "http://localhost:8080/x").ok).toBe(false);
    expect(resolveRedirect(cur, "file:///etc/passwd").ok).toBe(false);
    expect(resolveRedirect(cur, null).ok).toBe(false);
  });
});

describe("tipe & ukuran gambar", () => {
  it("hanya jpeg/png/webp", () => {
    expect(normalizeImageType("image/JPEG; charset=binary")).toBe("image/jpeg");
    expect(normalizeImageType("image/jpg")).toBe("image/jpeg");
    expect(normalizeImageType("image/png")).toBe("image/png");
    expect(normalizeImageType("image/webp")).toBe("image/webp");
    expect(normalizeImageType("image/gif")).toBeNull();
    expect(normalizeImageType("image/svg+xml")).toBeNull();
    expect(normalizeImageType("text/html")).toBeNull();
    expect(normalizeImageType(null)).toBeNull();
  });

  it("byte awal menentukan tipe sebenarnya", () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageType(webp)).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<html><body>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a......"))).toBeNull();
  });

  it("batas 8 MB", () => {
    expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024);
    expect(isTooLarge(MAX_IMAGE_BYTES)).toBe(false);
    expect(isTooLarge(MAX_IMAGE_BYTES + 1)).toBe(true);
    expect(declaredLength("1234")).toBe(1234);
    expect(declaredLength("abc")).toBeNull();
    expect(declaredLength(null)).toBeNull();
  });
});
