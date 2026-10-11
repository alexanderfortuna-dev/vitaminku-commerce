import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { POPULAR_SEARCHES } from "@/lib/catalog";
import { hasPrice, productSlug, productsQueryOptions } from "@/lib/catalog-db";
import { ProductThumb } from "@/components/ProductThumb";
import { formatIDR } from "@/lib/format";

export function SearchInput({ initialValue = "" }: { initialValue?: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initialValue);
  const [debounced, setDebounced] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value.trim()), 250);
    return () => clearTimeout(id);
  }, [value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data } = useQuery({
    ...productsQueryOptions({ search: debounced, sort: "name", limit: 6 }),
    enabled: debounced.length > 1 && open,
  });
  const suggestions = data?.products ?? [];

  const submit = (q: string) => {
    setOpen(false);
    navigate({ to: "/cari", search: { q } });
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value.trim());
        }}
      >
        <label className="sr-only" htmlFor="site-search">
          Cari produk
        </label>
        <div className="flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            id="site-search"
            value={value}
            onFocus={() => setOpen(true)}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Cari vitamin, protein, merek…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            inputMode="search"
            enterKeyHint="search"
          />
          {value && (
            <button
              type="button"
              aria-label="Hapus pencarian"
              onClick={() => setValue("")}
              className="shrink-0 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden card-surface">
          {debounced.length > 1 ? (
            suggestions.length > 0 ? (
              <ul className="max-h-80 divide-y divide-border overflow-auto">
                {suggestions.map((product) => (
                  <li key={product.id}>
                    <Link
                      to="/produk/$handle"
                      params={{ handle: productSlug(product) }}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 p-3 hover:bg-secondary"
                    >
                      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md">
                        <ProductThumb product={product} textClassName="text-xs" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{product.name}</span>
                        <span className="block text-xs text-primary">
                          {hasPrice(product) ? formatIDR(product.price!) : "Harga menyusul"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                Tidak ada hasil untuk “{debounced}”.
              </p>
            )
          ) : (
            <div className="p-3">
              <p className="px-1 pb-2 text-xs font-semibold text-muted-foreground">
                Pencarian populer
              </p>
              <div className="flex flex-wrap gap-2">
                {POPULAR_SEARCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-navy"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
