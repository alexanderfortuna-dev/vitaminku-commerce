import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { getDbAdminProduct, updateDbAdminProduct } from "@/lib/admin-products.functions";
import { PhotoGallery } from "@/components/admin/PhotoGallery";
import { VariantList } from "@/components/admin/VariantList";
import { canEditCommerce } from "@/lib/admin-roles";

export const Route = createFileRoute("/admin/produk/$id")({
  head: () => ({
    meta: [
      { title: "Edit Produk — Panel Admin | VitaminKu" },
      { name: "description", content: "Edit produk, foto, harga, dan stok katalog VitaminKu." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminProductDetailPage,
});

const inputClass = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm read-only:text-muted-foreground";

const EMPTY = {
  name: "",
  description: "",
  brand: "",
  category: "",
  subcategory: "",
  size: "",
  flavor: "",
  bpom_number: "",
  weight_grams: "",
  sku: "",
  price: "",
  compare_at_price: "",
  stock: "0",
  is_active: false,
  is_hero: false,
};

function AdminProductDetailPage() {
  const { id } = Route.useParams();
  const productId = decodeURIComponent(id);
  const queryClient = useQueryClient();

  const fetchProduct = useServerFn(getDbAdminProduct);
  const saveProduct = useServerFn(updateDbAdminProduct);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["admin-product", productId],
    queryFn: () => fetchProduct({ data: { id: productId } }),
    retry: false,
  });

  const role = (data?.role ?? null) as null | "owner" | "admin" | "seller";
  const commerce = canEditCommerce(role);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    const p = data?.product;
    if (!p) return;
    setForm({
      name: p.name,
      description: p.description ?? "",
      brand: p.brand ?? "",
      category: p.category ?? "",
      subcategory: p.subcategory ?? "",
      size: p.size ?? "",
      flavor: p.flavor ?? "",
      bpom_number: p.bpom_number ?? "",
      weight_grams: p.weight_grams == null ? "" : String(p.weight_grams),
      sku: p.sku ?? "",
      price: p.price == null ? "" : String(p.price),
      compare_at_price: p.compare_at_price == null ? "" : String(p.compare_at_price),
      stock: String(p.stock ?? 0),
      is_active: p.is_active,
      is_hero: p.is_hero ?? false,
    });
  }, [data?.product]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-product", productId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: () =>
      saveProduct({
        data: {
          id: productId,
          name: form.name,
          description: form.description,
          brand: form.brand,
          category: form.category,
          subcategory: form.subcategory,
          size: form.size,
          flavor: form.flavor,
          bpom_number: form.bpom_number,
          weight_grams: form.weight_grams,
          ...(commerce
            ? {
                sku: form.sku,
                price: form.price,
                compare_at_price: form.compare_at_price,
                stock: Number(form.stock || 0),
                is_active: form.is_active,
                is_hero: form.is_hero,
              }
            : {}),
        },
      }),
    onSuccess: (result) => {
      if (result.blocked) toast.error("Disimpan, tetapi produk ini terlarang dan tetap tidak tampil.");
      else if (form.is_active && result.product && !result.product.is_active)
        toast.error(`Disimpan sebagai Draf. ${result.product.publish_issue ?? ""}`, { duration: 10000 });
      else toast.success("Perubahan tersimpan");
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Gagal menyimpan"),
  });

  if (isPending) return <p className="p-4 text-sm text-muted-foreground">Memuat produk…</p>;

  if (isError) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Produk tidak dapat dimuat."}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  const product = data?.product;
  if (!product) return <p className="p-4 text-sm text-muted-foreground">Produk tidak ditemukan.</p>;

  return (
    <div className="px-4 py-4 pb-28">
      {product.is_blocked && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Produk terlarang untuk dijual online ({product.blocked_reason}). Tidak akan tampil di toko,
          pencarian, atau keranjang.
        </p>
      )}

      {product.publish_issue && !product.is_blocked && (
        <p className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
          {product.publish_issue}
        </p>
      )}
      <PhotoGallery productId={productId} images={product.images ?? []} />

      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-navy">Nama produk</span>
          <input value={form.name} onChange={set("name")} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-navy">Deskripsi</span>
          <textarea rows={6} value={form.description} onChange={set("description")} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-navy">Merek</span>
            <input value={form.brand} onChange={set("brand")} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-navy">No. BPOM</span>
            <input value={form.bpom_number} onChange={set("bpom_number")} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-navy">Kategori</span>
            <input value={form.category} onChange={set("category")} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-navy">Subkategori</span>
            <input value={form.subcategory} onChange={set("subcategory")} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-navy">Ukuran</span>
            <input value={form.size} onChange={set("size")} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-navy">Rasa / varian</span>
            <input value={form.flavor} onChange={set("flavor")} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-navy">Berat (gram) *</span>
            <input
              inputMode="numeric"
              value={form.weight_grams}
              onChange={(e) => setForm((f) => ({ ...f, weight_grams: e.target.value.replace(/\D/g, "") }))}
              placeholder="Wajib untuk ongkir"
              className={inputClass}
            />
          </label>
        </div>

        <h2 className="pt-2 text-sm font-extrabold text-navy">Harga, SKU & stok</h2>
        {!commerce && (
          <p className="text-xs text-muted-foreground">Hanya admin/owner yang dapat mengubah bagian ini.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-navy">Harga (IDR)</span>
            <input
              inputMode="numeric"
              readOnly={!commerce}
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(/\D/g, "") }))}
              placeholder="Kosong = Harga menyusul"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-navy">Harga coret</span>
            <input
              inputMode="numeric"
              readOnly={!commerce}
              value={form.compare_at_price}
              onChange={(e) =>
                setForm((f) => ({ ...f, compare_at_price: e.target.value.replace(/\D/g, "") }))
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-navy">SKU</span>
            <input readOnly={!commerce} value={form.sku} onChange={set("sku")} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-navy">Stok</span>
            <input
              inputMode="numeric"
              readOnly={!commerce}
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value.replace(/\D/g, "") }))}
              className={inputClass}
            />
          </label>
        </div>

        {commerce && (
          <label className="flex min-h-11 items-center justify-between rounded-xl border border-border p-3 text-xs font-semibold text-navy">
            <span>Hero — tampil di rail "Promo Pilihan" beranda</span>
            <input type="checkbox" className="h-5 w-5" checked={form.is_hero} onChange={(e) => setForm((f) => ({ ...f, is_hero: e.target.checked }))} />
          </label>
        )}
        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <span className="text-xs font-semibold text-navy">Status</span>
          {commerce && !product.is_blocked ? (
            <span className="flex gap-2">
              {([false, true] as const).map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_active: value }))}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    form.is_active === value ? "bg-primary text-primary-foreground" : "bg-secondary text-navy"
                  }`}
                >
                  {value ? "Tampilkan (Live)" : "Draf"}
                </button>
              ))}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {product.is_blocked ? "Diblokir" : product.is_active ? "Live" : "Draf"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5">
        <VariantList productId={productId} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-3xl border-t border-border bg-card p-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? "Menyimpan…" : "Simpan Perubahan"}
        </button>
      </div>
    </div>
  );
}
