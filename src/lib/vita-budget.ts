// Pure budget parsing + ranking for the Vita assistant (browser/server safe).

/** Parse Indonesian rupiah amounts: "500 ribu", "500rb", "0,5 jt", "Rp500.000", "1.5 juta". */
export function parseBudgetIdr(text: string): number | null {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  const unit = t.match(/(\d+(?:[.,]\d+)?)\s*(ribu|rb|k|juta|jt)\b/);
  if (unit) {
    const n = Number(unit[1]!.replace(",", "."));
    const mult = unit[2] === "juta" || unit[2] === "jt" ? 1_000_000 : 1_000;
    const v = Math.round(n * mult);
    return v > 0 ? v : null;
  }
  const rp = t.match(/rp\.?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)/);
  const plain = rp ?? t.match(/\b(\d{1,3}(?:\.\d{3})+)\b/);
  if (plain) {
    const v = Number(plain[1]!.replace(/[.,]/g, ""));
    return v >= 1000 ? v : null;
  }
  return null;
}

const TRIAL_RE = /\b(sachets?|sampel|samples?|trial|travel|mini|single serve|stick|eceran|coba)\b/i;

export function wantsTrialSize(text: string): boolean {
  return TRIAL_RE.test(text) || /\b(kecil|ketengan)\b/i.test(text);
}

export interface BudgetCandidate {
  price: number | null;
  name: string;
  size?: string | null;
  servings?: string | null;
}

export function isTrialSize(p: BudgetCandidate): boolean {
  if (TRIAL_RE.test(`${p.name} ${p.size ?? ""}`)) return true;
  const s = Number.parseInt(p.servings ?? "", 10);
  return Number.isFinite(s) && s > 0 && s <= 5;
}

function perServing(p: BudgetCandidate): number | null {
  const s = Number.parseInt(p.servings ?? "", 10);
  return p.price && Number.isFinite(s) && s > 0 ? p.price / s : null;
}

/**
 * Pick up to 3: [best value near budget, premium within budget, cheaper alternative].
 * Never returns anything above the budget. Full-size first unless trial is allowed.
 */
export function rankForBudget<T extends BudgetCandidate>(rows: T[], budget: number, allowTrial = false): T[] {
  const within = rows.filter((p) => p.price != null && p.price > 0 && p.price <= budget);
  const full = within.filter((p) => !isTrialSize(p));
  const pool = (allowTrial || full.length === 0 ? within : full).slice().sort((a, b) => b.price! - a.price!);
  if (pool.length <= 1) return pool;

  const premium = pool[0]!;
  const rest = pool.slice(1);
  const near = rest.filter((p) => p.price! >= budget * 0.6);
  const valueOf = (p: T) => perServing(p) ?? p.price!;
  const bestValue =
    near.length > 0
      ? near.slice().sort((a, b) => valueOf(a) - valueOf(b) || b.price! - a.price!)[0]!
      : rest[0]!;
  const remaining = rest.filter((p) => p !== bestValue && p.price! < Math.min(premium.price!, bestValue.price!));
  const cheaperPool = remaining.length ? remaining : rest.filter((p) => p !== bestValue);
  const cheaper =
    cheaperPool.find((p) => p.price! <= budget * 0.7) ?? cheaperPool[cheaperPool.length - 1];
  return [bestValue, premium, ...(cheaper ? [cheaper] : [])];
}
