import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG_BLOCKLIST, isCatalogForbidden } from "../../../supabase/functions/_shared/forbidden-catalog";
import { isForbiddenText } from "../../../supabase/functions/_shared/vitamin-finder-core";
import { isForbiddenRequest } from "../vita-safety";
import { isForbidden } from "../vita/safety";

function sqlBlocklistPatterns(): string[] {
  const dir = resolve(process.cwd(), "drizzle/migrations");
  const found: string[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(resolve(dir, file), "utf8");
    for (const chunk of sql.split(/INSERT INTO public\.product_blocklist/i).slice(1)) {
      const body = chunk.split(/ON CONFLICT/i)[0] ?? chunk;
      const row = /\('((?:\\.|[^'])*)'\s*,\s*'((?:\\.|[^'])*)'\)/g;
      for (let match = row.exec(body); match; match = row.exec(body)) found.push(match[1]!);
    }
  }
  return found;
}

describe("daftar produk terlarang", () => {
  it("pola di kode sama persis dengan product_blocklist di migrasi", () => {
    const sql = sqlBlocklistPatterns();
    const code = CATALOG_BLOCKLIST.map((row) => row.pattern);
    expect(code.slice().sort()).toEqual(sql.slice().sort());
    expect(new Set(code).size).toBe(code.length);
  });

  it("Clenbuterol diblokir di katalog, Vita, dan finder; dukungan alami tidak", () => {
    for (const name of ["Clenbuterol 40mcg", "jual clenbuterol", "MK-2866", "trenbolone", "Viagra"]) {
      expect(isCatalogForbidden(name), name).toBe(true);
      expect(isForbiddenRequest(name), name).toBe(true);
      expect(isForbiddenText(name), name).toBe(true);
    }
    for (const name of ["Tongkat Ali 400mg", "Tribulus terrestris", "Testosterone Support", "Vitamin C 500", "decaf coffee"]) {
      expect(isCatalogForbidden(name), name).toBe(false);
      expect(isForbiddenRequest(name), name).toBe(false);
    }
  });

  it("obrolan Vita tetap menolak dukungan testosteron alami sampai owner memutuskan", () => {
    expect(isForbidden("Tongkat Ali untuk stamina")).toBe(true);
    expect(isForbidden("tribulus")).toBe(true);
    expect(isCatalogForbidden("Tongkat Ali untuk stamina")).toBe(false);
  });
});
