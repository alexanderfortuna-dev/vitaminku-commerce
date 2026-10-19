import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "../simple-markdown";

describe("simple-markdown", () => {
  it("judul, daftar bernomor, daftar biasa, paragraf", () => {
    const b = parseMarkdown("# A\n\n## B\n1. satu\n2. dua\n- x\n\nteks");
    expect(b.map((x) => x.kind)).toEqual(["h1", "h2", "ol", "ul", "p"]);
  });
  it("tebal, kode, tautan aman; tautan javascript: jadi teks biasa", () => {
    expect(parseInline("**Akun Staf** lalu `TERAPKAN` di [GitHub](https://github.com)")).toEqual([
      { kind: "bold", text: "Akun Staf" },
      { kind: "text", text: " lalu " },
      { kind: "code", text: "TERAPKAN" },
      { kind: "text", text: " di " },
      { kind: "link", text: "GitHub", href: "https://github.com" },
    ]);
    expect(parseInline("[x](javascript:alert(1))")[0]!.kind).toBe("text");
  });
  it("PANDUAN_OWNER.md: tanpa email pribadi, memuat bagian wajib", () => {
    const md = readFileSync(new URL("../../../PANDUAN_OWNER.md", import.meta.url), "utf8");
    expect(md).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
    const heads = parseMarkdown(md).filter((b) => b.kind === "h2").length;
    expect(heads).toBeGreaterThanOrEqual(6);
  });
});
