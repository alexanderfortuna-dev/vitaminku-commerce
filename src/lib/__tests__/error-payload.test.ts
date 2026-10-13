import { describe, expect, it } from "vitest";
import {
  ERROR_LIMITS,
  auditActionFor,
  auditPayload,
  redact,
  reportFromDescription,
  sanitizeErrorReport,
  sanitizePath,
  shouldIgnoreClientError,
} from "../error-payload";

describe("redact", () => {
  it("membuang email, telepon, JWT, Bearer, token heks, dan kunci=nilai", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcDEF123_-";
    const out = redact(
      `gagal untuk budi@contoh.com di 0812-3456-7890 dan +62 811 2222 3333; ${jwt}; Authorization: Bearer abc.def-123; ` +
        `order ${"a1".repeat(24)}; apikey=SUPERSECRET123 password: hunter2`,
    );
    expect(out).not.toMatch(/budi@|0812|811 2222|eyJ|abc\.def|a1a1a1|SUPERSECRET|hunter2/);
    expect(out).toContain("[email]");
    expect(out).toContain("[telepon]");
    expect(out).toContain("[token]");
  });

  it("membuang query string dari URL di stack", () => {
    const out = redact("at fn (https://toko.id/assets/app.js?token=abc123&x=1:10:5)");
    expect(out).not.toContain("token=abc123");
    expect(out).toContain("https://toko.id/assets/app.js");
  });
});

describe("sanitizePath", () => {
  it("hanya path; tanpa domain, query, hash; segmen token disamarkan", () => {
    expect(sanitizePath("https://toko.id/produk/vit-c?utm=1#x")).toBe("/produk/vit-c");
    expect(sanitizePath("/pesanan/" + "f".repeat(48) + "?a=b")).toBe("/pesanan/[token]");
    expect(sanitizePath("javascript:alert(1)")).toBeNull();
    expect(sanitizePath(42)).toBeNull();
  });
});

describe("sanitizeErrorReport", () => {
  it("memotong pesan & stack, hanya kolom dikenal", () => {
    const r = sanitizeErrorReport(
      {
        message: "x".repeat(2000),
        stack: Array.from({ length: 40 }, (_, i) => `at f${i} (file.js:${i}:1)`).join("\n"),
        url: "https://toko.id/keranjang?email=a@b.co",
        kind: "unhandledrejection",
        cookie: "sesi=rahasia",
        userAgent: "Mozilla",
      },
      "client",
    )!;
    expect(r.message.length).toBeLessThanOrEqual(ERROR_LIMITS.message);
    expect(r.stack!.split("\n").length).toBeLessThanOrEqual(ERROR_LIMITS.stackLines);
    expect(r.stack!.length).toBeLessThanOrEqual(ERROR_LIMITS.stack);
    expect(r.path).toBe("/keranjang");
    expect(r.kind).toBe("unhandledrejection");
    expect(JSON.stringify(auditPayload(r))).not.toMatch(/rahasia|Mozilla|a@b/);
    expect(Object.keys(auditPayload(r)).sort()).toEqual(["kind", "message", "path", "stack"]);
  });

  it("menolak masukan tak berguna dan kind liar", () => {
    expect(sanitizeErrorReport(null, "client")).toBeNull();
    expect(sanitizeErrorReport("teks", "client")).toBeNull();
    expect(sanitizeErrorReport({ message: "   " }, "client")).toBeNull();
    expect(sanitizeErrorReport({ message: 123 }, "client")).toBeNull();
    expect(sanitizeErrorReport({ message: "ok", kind: "<script>" }, "client")!.kind).toBeNull();
  });

  it("pesan berisi data pribadi disamarkan", () => {
    const r = sanitizeErrorReport({ message: "Gagal kirim ke siti@mail.com (081234567890)" }, "client")!;
    expect(r.message).not.toMatch(/siti@|081234567890/);
  });
});

describe("laporan server & aksi audit", () => {
  it("baris pertama = pesan, sisanya = stack; aksi sesuai sumber", () => {
    const r = reportFromDescription("Error: gagal\n    at a (x.js:1:1)\ncaused by: Error: akar", "ssr")!;
    expect(r.source).toBe("server");
    expect(r.message).toBe("Error: gagal");
    expect(r.stack).toContain("caused by");
    expect(auditActionFor("client")).toBe("client_error");
    expect(auditActionFor("server")).toBe("server_error");
    expect(reportFromDescription("")).toBeNull();
  });
});

describe("shouldIgnoreClientError", () => {
  it("mengabaikan galat bising", () => {
    expect(shouldIgnoreClientError("Script error.")).toBe(true);
    expect(shouldIgnoreClientError("ResizeObserver loop completed with undelivered notifications")).toBe(true);
    expect(shouldIgnoreClientError("")).toBe(true);
    expect(shouldIgnoreClientError("TypeError: x is undefined")).toBe(false);
  });
});
