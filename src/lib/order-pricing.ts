// Pure order pricing used by the server. Browser-supplied prices are never read:
// callers pass only product ids/slugs and quantities; prices come from the database.
import { isPromoRunning, lineDiscount, promoAppliesTo, type Promo } from "./promo";

export const MAX_ORDER_LINE_QUANTITY = 99;

export interface OrderRequestLine {
  slug: string;
  quantity: number;
}

export interface PricedDbRow {
  slug: string | null;
  name: string;
  price: number | null;
  stock: number;
  is_active: boolean;
  is_blocked: boolean;
  brand?: string | null;
}

export interface QuotedLine {
  slug: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discount: number;
}

export interface OrderQuote {
  lines: QuotedLine[];
  rejected: Array<{ slug: string; reason: "not_found" | "unavailable" | "no_price" | "out_of_stock" }>;
  subtotal: number;
  discount: number;
  /** Code of the promo actually applied (null when none or not valid now / for these items). */
  promoCode: string | null;
}

export function quoteOrderLines(
  request: OrderRequestLine[],
  rows: PricedDbRow[],
  promo: Promo | null = null,
  now: Date = new Date(),
): OrderQuote {
  const bySlug = new Map(rows.filter((r) => r.slug).map((r) => [r.slug!, r]));
  const merged = new Map<string, number>();
  for (const line of request) {
    const qty = Math.floor(Number(line.quantity));
    if (!line.slug || !Number.isFinite(qty) || qty < 1) continue;
    merged.set(line.slug, Math.min((merged.get(line.slug) ?? 0) + qty, MAX_ORDER_LINE_QUANTITY));
  }
  const running = promo && isPromoRunning(promo, now) ? promo : null;

  const lines: QuotedLine[] = [];
  const rejected: OrderQuote["rejected"] = [];
  for (const [slug, quantity] of merged) {
    const row = bySlug.get(slug);
    if (!row) rejected.push({ slug, reason: "not_found" });
    else if (!row.is_active || row.is_blocked) rejected.push({ slug, reason: "unavailable" });
    else if (row.price === null || !Number.isFinite(Number(row.price)) || Number(row.price) <= 0)
      rejected.push({ slug, reason: "no_price" });
    else if (row.stock < quantity) rejected.push({ slug, reason: "out_of_stock" });
    else {
      const unitPrice = Math.round(Number(row.price));
      const lineTotal = unitPrice * quantity;
      const discount = running && promoAppliesTo(running, row.brand) ? lineDiscount(lineTotal, running) : 0;
      lines.push({ slug, name: row.name, quantity, unitPrice, lineTotal, discount });
    }
  }
  const discount = lines.reduce((s, l) => s + l.discount, 0);
  return {
    lines,
    rejected,
    subtotal: lines.reduce((sum, l) => sum + l.lineTotal, 0),
    discount,
    promoCode: discount > 0 && running ? running.code : null,
  };
}
