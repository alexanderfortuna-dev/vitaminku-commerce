import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANAGER_PERMS, OWNER_ONLY_PERMS, SELLER_PERMS, hasPermission } from "../permissions";

const sql = readFileSync(
  join(process.cwd(), "drizzle/migrations/0010_permissions_and_customers.sql"),
  "utf8",
);

function sqlArray(name: string): string[] {
  const m = sql.match(new RegExp(`${name}\\s+text\\[\\]\\s*:=\\s*ARRAY\\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error(`array ${name} tidak ditemukan di SQL`);
  return [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
}

describe("izin TypeScript = izin SQL", () => {
  it("owner_only sama", () => expect([...OWNER_ONLY_PERMS].sort()).toEqual(sqlArray("owner_only").sort()));
  it("manager_perms sama", () => expect([...MANAGER_PERMS].sort()).toEqual(sqlArray("manager_perms").sort()));
  it("seller_perms sama", () => expect([...SELLER_PERMS].sort()).toEqual(sqlArray("seller_perms").sort()));
});

describe("matriks izin", () => {
  it("manajer tidak punya izin khusus owner", () => {
    for (const p of OWNER_ONLY_PERMS) {
      if (p === "hpp_view") continue;
      expect(hasPermission({ role: "admin" }, p)).toBe(false);
    }
  });
  it("manajer hanya boleh lihat HPP jika diberi can_view_hpp, tapi tidak boleh ubah", () => {
    expect(hasPermission({ role: "admin" }, "hpp_view")).toBe(false);
    expect(hasPermission({ role: "admin", canViewHpp: true }, "hpp_view")).toBe(true);
    expect(hasPermission({ role: "admin", canViewHpp: true }, "hpp_edit")).toBe(false);
  });
  it("seller hanya produk+foto, pelanggan tanpa peran tak punya izin", () => {
    expect(hasPermission({ role: "seller" }, "products_photos")).toBe(true);
    expect(hasPermission({ role: "seller" }, "orders_manage")).toBe(false);
    expect(hasPermission({ role: null }, "products_edit")).toBe(false);
  });
  it("owner punya semuanya", () => {
    for (const p of [...OWNER_ONLY_PERMS, ...MANAGER_PERMS, ...SELLER_PERMS])
      expect(hasPermission({ role: "owner" }, p)).toBe(true);
  });
});
