import { describe, expect, it } from "vitest";
import { formatSuite, loadSnapshot, runSuite } from "../vita/eval/harness";
import { snapshotSearch } from "../vita/eval/catalog-search";
import { runVitaKeyword } from "../vita/engine";

// Gerbang mutu: kasus emas (evals/vita-golden.json) di atas salinan katalog produksi harus lulus ≥ 95%.
describe("eval Vita (kasus emas)", () => {
  it("mode kata kunci ≥ 95%", async () => {
    const catalog = loadSnapshot();
    const s = await runSuite((input) => runVitaKeyword(input, { search: snapshotSearch(catalog) }), undefined, catalog);
    expect(s.total).toBeGreaterThanOrEqual(40);
    expect(s.rate, formatSuite("keyword", s)).toBeGreaterThanOrEqual(0.95);
  }, 30_000);
});
