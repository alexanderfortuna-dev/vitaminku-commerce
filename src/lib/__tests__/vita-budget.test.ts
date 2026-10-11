import { describe, expect, it } from "vitest";
import { parseBudgetIdr, rankForBudget, wantsTrialSize } from "../vita-budget";

describe("parseBudgetIdr", () => {
  it.each([
    ["whey budget 500 ribu", 500000],
    ["maks 500rb", 500000],
    ["0,5 jt aja", 500000],
    ["1.5 juta", 1500000],
    ["Rp500.000", 500000],
    ["rp 250.000", 250000],
    ["150k", 150000],
    ["harga 125.000", 125000],
  ])("%s → %d", (t, v) => expect(parseBudgetIdr(t)).toBe(v));
  it("returns null without amount", () => expect(parseBudgetIdr("whey untuk pemula")).toBeNull());
});

describe("rankForBudget", () => {
  const rows = [
    { name: "Whey A 2lb", price: 480000, servings: "30" },
    { name: "Whey B 2lb", price: 450000, servings: "40" },
    { name: "Whey C 1lb", price: 300000, servings: "15" },
    { name: "Whey Sachet", price: 16500, servings: "1" },
    { name: "Whey Premium 5lb", price: 900000, servings: "70" },
  ];
  it("never exceeds budget and orders value, premium, cheaper", () => {
    const r = rankForBudget(rows, 500000);
    expect(r.map((p) => p.name)).toEqual(["Whey B 2lb", "Whey A 2lb", "Whey C 1lb"]);
  });
  it("skips sachets unless trial allowed", () => {
    expect(rankForBudget(rows, 500000).some((p) => p.name.includes("Sachet"))).toBe(false);
    expect(rankForBudget(rows, 20000, true).map((p) => p.name)).toEqual(["Whey Sachet"]);
  });
  it("detects trial requests", () => expect(wantsTrialSize("mau coba sachet dulu")).toBe(true));
});
