export function formatIDR(amount: string | number) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function discountPercent(price: string, compareAt?: string | null) {
  const p = Number(price);
  const c = Number(compareAt ?? 0);
  if (!c || c <= p) return null;
  return Math.round(((c - p) / c) * 100);
}
