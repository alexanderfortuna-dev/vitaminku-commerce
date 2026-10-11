import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { updateDbAdminProduct } from "@/lib/admin-products.functions";
import {
  bulkSellerAction,
  getSellerFacets,
  listSellerProducts,
  type SellerTab,
} from "@/lib/seller.functions";
import { formatRp } from "@/lib/sheet-io";
import { canEditCommerce } from "@/lib/admin-roles";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Produk Saya — Seller Center | VitaminKu" },
      { name: "description", content: "Kelola produk toko VitaminKu: status, harga, stok, dan kelengkapan." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SellerProductsPage,
});

const TABS: Array<[SellerTab, string]> = [
  ["ALL", "Semua"],
  ["LIVE", "Live"],
  ["DRAFT", "Draf"],
  ["INCOMPLETE", "Belum Lengkap"],
  ["OUT", "Stok Habis"],
  ["BLOCKED", "Diblokir"],
];

function SellerProductsPage() {
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as null | "owner" | "admin" | "seller";
  if (!canEditCommerce(role)) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Seller Center hanya untuk admin dan owner.
      </p>
    );
  }
  return <ProductList />;
}

function ProductList() {
  const [tab, setTab] = useState<SellerTab>("ALL");
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStock, setBulkStock] = useState("3");
  const queryClient = useQueryClient();

  const fetchList = useServerFn(listSellerProducts);
  const fetchFacets = useServerFn(getSellerFacets);
  const runBulk = useServerFn(bulkSellerAction);

  const facets = useQuery({ queryKey: ["seller-facets"], queryFn: () => fetchFacets(), staleTime: 300_000 });
  const list = useQuery({
    queryKey: ["admin-products", tab, search, brand, category, page],
    queryFn: () => fetchList({ data: { tab, search, brand, category, page } }),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const reset = () => {
    setPage(0);
    setSelected([]);
  };

  const bulk = useMutation({
    mutationFn: (action: "publish" | "archive" | "stock") =>
      runBulk({ data: { ids: selected, action, stock: Number(bulkStock) } }),
    onSuccess: (r, action) => {
      if (action === "publish") {
        if (r.notLive.length) {
          toast.error(
            `${r.live} tampil, ${r.notLive.length} tetap Draf: ${r.notLive
              .slice(0, 3)
              .map((x) => `${x.sku} (${x.reason})`)
              .join("; ")}${r.notLive.length > 3 ? " …" : ""}`,
            { duration: 10000 },
          );
        } else toast.success(`${r.live} produk tampil`);
      } else toast.success(`${r.updated} produk diperbarui`);
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });

  const data = list.data;
  const products = data?.products ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const selectClass = "min-w-0 flex-1 rounded-full border border-border bg-background px-3 py-2 text-xs";

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              reset();
            }}
            placeholder="Cari nama atau SKU"
            className="w-full rounded-full border border-border bg-background py-3 pl-9 pr-3 text-sm"
          />
        </div>
        <Link
          to="/admin/produk/baru"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
          aria-label="Tambah produk"
        >
          <Plus className="h-5 w-5" />
        </Link>
      </div>

      <div className="mt-2 flex gap-2">
        <select
          aria-label="Filter brand"
          value={brand}
          onChange={(e) => {
            setBrand(e.target.value);
            reset();
          }}
          className={selectClass}
        >
          <option value="">Semua brand</option>
          {facets.data?.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter kategori"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            reset();
          }}
          className={selectClass}
        >
          <option value="">Semua kategori</option>
          {facets.data?.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              reset();
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
              tab === value ? "bg-primary text-primary-foreground" : "bg-secondary text-navy"
            }`}
          >
            {label}
            {data ? ` (${data.counts[value].toLocaleString("id-ID")})` : ""}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="sticky top-[57px] z-10 mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-secondary p-3">
          <span className="text-xs font-semibold text-navy">{selected.length} dipilih</span>
          <button
            type="button"
            disabled={bulk.isPending}
            onClick={() => bulk.mutate("publish")}
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
          >
            Tampilkan
          </button>
          <button
            type="button"
            disabled={bulk.isPending}
            onClick={() => bulk.mutate("archive")}
            className="rounded-full bg-card px-3 py-1.5 text-xs font-bold text-navy"
          >
            Arsipkan
          </button>
          <span className="flex items-center gap-1">
            <input
              aria-label="Stok massal"
              inputMode="numeric"
              value={bulkStock}
              onChange={(e) => setBulkStock(e.target.value.replace(/\D/g, ""))}
              className="w-14 rounded-full border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              disabled={bulk.isPending || bulkStock === ""}
              onClick={() => bulk.mutate("stock")}
              className="rounded-full bg-card px-3 py-1.5 text-xs font-bold text-navy"
            >
              Set stok
            </button>
          </span>
        </div>
      )}

      {list.isError ? (
        <div className="mt-6">
          <p className="text-sm text-muted-foreground">
            {list.error instanceof Error ? list.error.message : "Produk tidak dapat dimuat."}
          </p>
          <button
            type="button"
            onClick={() => void list.refetch()}
            className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Coba lagi
          </button>
        </div>
      ) : list.isPending ? (
        <p className="mt-6 text-sm text-muted-foreground">Memuat produk…</p>
      ) : products.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Tidak ada produk di tab ini.</p>
      ) : (
        <>
          <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={products.every((p) => selected.includes(p.id))}
              onChange={(e) => setSelected(e.target.checked ? products.map((p) => p.id) : [])}
              className="h-4 w-4"
            />
            Pilih semua di halaman ini
          </label>
          <ul className="mt-2 space-y-2">
            {products.map((p) => (
              <li key={p.id} className="flex gap-3 p-3 card-surface">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))
                  }
                  aria-label={`Pilih ${p.name}`}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <Link to="/admin/produk/$id" params={{ id: encodeURIComponent(p.id) }} className="shrink-0">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" loading="lazy" className="h-14 w-14 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-14 w-14 place-items-center rounded-lg bg-secondary text-muted-foreground">
                      <ImageOff className="h-5 w-5" />
                    </span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/admin/produk/$id"
                    params={{ id: encodeURIComponent(p.id) }}
                    className="block truncate text-sm font-semibold text-navy"
                  >
                    {p.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.sku} · {p.brand || "Tanpa brand"}
                  </p>
                  <InlinePriceStock id={p.id} price={p.price} stock={p.stock} />
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        p.is_blocked
                          ? "bg-destructive/10 text-destructive"
                          : p.is_active
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {p.is_blocked ? "Diblokir" : p.is_active ? "Live" : "Draf"}
                    </span>
                    {p.missing.length > 0 && !p.is_blocked && (
                      <span className="text-[10px] font-semibold text-destructive">
                        {p.missing.map((m, i) => (i === 0 ? m[0]!.toUpperCase() + m.slice(1) : m)).join(", ")}
                      </span>
                    )}
                  </div>
                  {(p.publish_issue || p.blocked_reason) && (
                    <p className="mt-1 text-[10px] text-muted-foreground">{p.publish_issue ?? p.blocked_reason}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={page === 0 || list.isFetching}
              onClick={() => {
                setPage((n) => n - 1);
                setSelected([]);
              }}
              className="flex items-center gap-1 rounded-full bg-secondary px-3 py-2 text-xs font-bold text-navy disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Sebelumnya
            </button>
            <span className="text-xs text-muted-foreground">
              Hal. {page + 1} / {pages}
            </span>
            <button
              type="button"
              disabled={page + 1 >= pages || list.isFetching}
              onClick={() => {
                setPage((n) => n + 1);
                setSelected([]);
              }}
              className="flex items-center gap-1 rounded-full bg-secondary px-3 py-2 text-xs font-bold text-navy disabled:opacity-40"
            >
              Berikutnya <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function InlinePriceStock({ id, price, stock }: { id: string; price: number | null; stock: number }) {
  const [editing, setEditing] = useState(false);
  const [p, setP] = useState(price == null ? "" : String(price));
  const [s, setS] = useState(String(stock));
  const save = useServerFn(updateDbAdminProduct);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => save({ data: { id, price: p === "" ? null : p, stock: Number(s || 0) } }),
    onSuccess: () => {
      toast.success("Harga & stok disimpan");
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan"),
  });

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 rounded-lg border border-dashed border-border px-2 py-1 text-left text-xs text-navy"
        aria-label="Ubah harga dan stok"
      >
        <span className="font-bold">{price == null ? "Tanpa harga" : formatRp(price)}</span> · stok {stock} ✎
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <input
        aria-label="Harga"
        inputMode="numeric"
        value={p}
        onChange={(e) => setP(e.target.value.replace(/\D/g, ""))}
        placeholder="Harga"
        className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-xs"
      />
      <input
        aria-label="Stok"
        inputMode="numeric"
        value={s}
        onChange={(e) => setS(e.target.value.replace(/\D/g, ""))}
        className="w-14 rounded-lg border border-border bg-background px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
      >
        Simpan
      </button>
      <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-xs text-muted-foreground">
        Batal
      </button>
    </form>
  );
}
