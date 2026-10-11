import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isBuyable, productSlug, type DbProduct } from "@/lib/catalog-db";

// Database cart keyed by product slug, persisted per browser. Prices shown here
// are display-only; the server recomputes every total from the database.
export const MAX_LINE_QUANTITY = 99;

export interface CartItem {
  slug: string;
  product: DbProduct;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  savedItems: CartItem[];
  addItem: (product: DbProduct, quantity?: number) => void;
  updateQuantity: (slug: string, quantity: number) => void;
  removeItem: (slug: string) => void;
  saveForLater: (slug: string) => void;
  moveToCart: (slug: string) => void;
  clearCart: () => void;
  /** Applies fresh catalog rows: updates price/stock, caps quantity, drops vanished items. */
  refreshFromCatalog: (rows: DbProduct[], requestedSlugs: string[]) => string[];
}

export function clampQuantity(quantity: number, stock: number): number {
  const q = Math.floor(Number(quantity));
  if (!Number.isFinite(q) || q < 1) return 0;
  return Math.min(q, MAX_LINE_QUANTITY, Math.max(0, stock));
}

/** Pure merge of fresh catalog rows into cart items. Returns kept items and notices. */
export function reconcileWithCatalog(
  items: CartItem[],
  rows: DbProduct[],
  requestedSlugs: string[],
): { items: CartItem[]; notices: string[] } {
  const bySlug = new Map(rows.map((r) => [productSlug(r), r]));
  const requested = new Set(requestedSlugs);
  const notices: string[] = [];
  const next: CartItem[] = [];
  for (const item of items) {
    if (!requested.has(item.slug)) {
      next.push(item);
      continue;
    }
    const row = bySlug.get(item.slug);
    if (!row || !isBuyable(row)) {
      notices.push(`${item.product.name} tidak tersedia lagi dan dihapus dari keranjang.`);
      continue;
    }
    const quantity = clampQuantity(item.quantity, row.stock);
    if (quantity < item.quantity) notices.push(`Jumlah ${row.name} disesuaikan dengan stok (${quantity}).`);
    next.push({ slug: item.slug, product: row, quantity });
  }
  return { items: next, notices };
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      savedItems: [],
      addItem: (product, quantity = 1) => {
        if (!isBuyable(product)) throw new Error("Produk ini belum bisa dibeli.");
        const slug = productSlug(product);
        const items = get().items;
        const existing = items.find((i) => i.slug === slug);
        const wanted = (existing?.quantity ?? 0) + quantity;
        const q = clampQuantity(wanted, product.stock);
        if (q === 0) throw new Error("Stok habis.");
        if (existing && q === existing.quantity) throw new Error("Jumlah sudah maksimal sesuai stok.");
        set({
          items: existing
            ? items.map((i) => (i.slug === slug ? { ...i, product, quantity: q } : i))
            : [...items, { slug, product, quantity: q }],
          savedItems: get().savedItems.filter((i) => i.slug !== slug),
        });
      },
      updateQuantity: (slug, quantity) => {
        if (quantity < 1) return get().removeItem(slug);
        set({
          items: get().items.map((i) =>
            i.slug === slug ? { ...i, quantity: Math.max(1, clampQuantity(quantity, i.product.stock)) } : i,
          ),
        });
      },
      removeItem: (slug) => set({ items: get().items.filter((i) => i.slug !== slug) }),
      saveForLater: (slug) => {
        const item = get().items.find((i) => i.slug === slug);
        if (!item) return;
        set({
          items: get().items.filter((i) => i.slug !== slug),
          savedItems: [item, ...get().savedItems.filter((i) => i.slug !== slug)],
        });
      },
      moveToCart: (slug) => {
        const item = get().savedItems.find((i) => i.slug === slug);
        if (!item) return;
        get().addItem(item.product, item.quantity);
        set({ savedItems: get().savedItems.filter((i) => i.slug !== slug) });
      },
      clearCart: () => set({ items: [] }),
      refreshFromCatalog: (rows, requestedSlugs) => {
        const { items, notices } = reconcileWithCatalog(get().items, rows, requestedSlugs);
        set({ items });
        return notices;
      },
    }),
    {
      name: "vitaminku-cart-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items, savedItems: s.savedItems }),
    },
  ),
);
