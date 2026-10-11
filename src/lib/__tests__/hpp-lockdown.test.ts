import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// HPP (harga pokok) tidak boleh dibaca kode aplikasi mana pun: pelanggan hanya melihat harga jual.
// Satu-satunya tempat yang boleh menyebut `hpp` adalah tipe database hasil generate, komentar, dan tes ini.
function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

describe("HPP tidak terjangkau dari kode aplikasi", () => {
  it("tidak ada pemakaian `hpp` selain tipe generate, komentar, dan tes", () => {
    const offenders = walk("src")
      .filter((f) => !f.endsWith("integrations/supabase/types.ts") && !f.includes("__tests__"))
      .filter((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .some((l) => /\bhpp\b/i.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)),
      );
    expect(offenders).toEqual([]);
  });
});
