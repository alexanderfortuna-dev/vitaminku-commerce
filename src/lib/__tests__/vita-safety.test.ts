import { describe, expect, it } from "vitest";
import { extractOrderToken, isForbiddenRequest, VITA_RATE_LIMIT, VITA_RATE_WINDOW_MINUTES, VITA_MAX_CARDS } from "../vita-safety";

describe("Vita safety rules", () => {
  it("refuses forbidden product requests", () => {
    for (const q of ["jual modafinil?", "ada SARMs ostarine", "yohimbine fat burner", "DHEA 50mg", "obat keras buat tidur", "RAD-140"])
      expect(isForbiddenRequest(q)).toBe(true);
  });
  it("allows normal supplement requests", () => {
    for (const q of ["whey untuk pemula budget 500 ribu", "vitamin c", "magnesium untuk tidur", "creatine"])
      expect(isForbiddenRequest(q)).toBe(false);
  });
  it("limits 20 messages per 10 minutes and 3 cards", () => {
    expect([VITA_RATE_LIMIT, VITA_RATE_WINDOW_MINUTES, VITA_MAX_CARDS]).toEqual([20, 10, 3]);
  });
  it("reads an order token from a pasted link", () => {
    const t = "a".repeat(48);
    expect(extractOrderToken(`https://vitaku-shop.lovable.app/pesanan/${t}`)).toBe(t);
    expect(extractOrderToken("VK-123")).toBeNull();
  });
});
