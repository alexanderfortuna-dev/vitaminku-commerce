import { useEffect } from "react";
import { toast } from "sonner";
import { getProductsBySlugs } from "@/lib/catalog.functions";
import { useCartStore } from "@/stores/cartStore";

/** Refreshes cart prices/stock from the database catalog once per page load. */
export function useCartSync() {
  useEffect(() => {
    const slugs = useCartStore.getState().items.map((i) => i.slug);
    if (slugs.length === 0) return;
    getProductsBySlugs({ data: { slugs } })
      .then((rows) => {
        for (const n of useCartStore.getState().refreshFromCatalog(rows, slugs)) toast.info(n);
      })
      .catch(() => {
        /* keep cart as-is; server re-checks at checkout */
      });
  }, []);
}
