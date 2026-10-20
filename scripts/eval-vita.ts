// Jalankan: bun run eval:vita [mesin...]   (mesin: rilis2 | keyword | ai)
// Menilai Vita terhadap evals/vita-golden.json di atas salinan katalog produksi (evals/catalog-snapshot.json).
// Keluar dengan kode 1 bila mesin selain "rilis2" lulus < 95%.
import { runFinder } from "../supabase/functions/_shared/vitamin-finder-core";
import { formatSuite, loadSnapshot, runSuite, type Engine } from "../src/lib/vita/eval/harness";
import { legacySearch } from "../src/lib/vita/eval/legacy-search";
import { snapshotSearch } from "../src/lib/vita/eval/catalog-search";
import { runVitaKeyword } from "../src/lib/vita/engine";
import { runVitaAi } from "../src/lib/vita/ai";
import { fixtureModel } from "../src/lib/vita/eval/fixture-model";

const catalog = loadSnapshot();
const engines: Record<string, Engine> = {
  // Jalur produksi Rilis 2: saringan keamanan → model (tanpa kunci: gagal) → mode kata kunci.
  rilis2: (input) =>
    runFinder({ input, searchProducts: legacySearch(catalog), callModel: () => Promise.reject(new Error("missing_api_key")), log: () => {} }),
  // Rilis 3, mode tanpa AI (dipakai bila ANTHROPIC_API_KEY kosong).
  keyword: (input) => runVitaKeyword(input, { search: snapshotSearch(catalog) }),
  // Rilis 3, jalur AI dengan model rekaman (tanpa kunci). Uji model sungguhan: "menunggu kunci".
  ai: (input) => runVitaAi(input, { search: snapshotSearch(catalog), callModel: fixtureModel() }),
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(engines).filter((k) => k !== "rilis2");
let failed = false;
for (const name of wanted) {
  const engine = engines[name];
  if (!engine) {
    console.log(`Mesin tidak dikenal: ${name}`);
    failed = true;
    continue;
  }
  const s = await runSuite(engine, undefined, catalog);
  console.log(formatSuite(name, s));
  if (process.env["EVAL_VERBOSE"]) for (const r of s.results) console.log(`  ${r.pass ? "LULUS" : "GAGAL"} ${r.id}: ${r.brands.join(", ")}`);
  if (name !== "rilis2" && s.rate < 0.95) failed = true;
}
process.exit(failed ? 1 : 0);
