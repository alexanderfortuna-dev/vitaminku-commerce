import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { createVariant, listVariants } from "@/lib/seller.functions";
import { formatRp } from "@/lib/sheet-io";

const input = "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs";

/** Variants (flavour/size): each variant is its own product row with its own SKU, price, stock and weight. */
export function VariantList({ productId }: { productId: string }) {
  const fetchVariants = useServerFn(listVariants);
  const create = useServerFn(createVariant);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sku: "", flavor: "", size: "", price: "", stock: "", weight_grams: "" });
  const variants = useQuery({ queryKey: ["variants", productId], queryFn: () => fetchVariants({ data: { id: productId } }) });

  const mutation = useMutation({
    mutationFn: () => create({ data: { fromId: productId, ...form } }),
    onSuccess: (r) => {
      toast.success("Varian dibuat sebagai Draf");
      setOpen(false);
      setForm({ sku: "", flavor: "", size: "", price: "", stock: "", weight_grams: "" });
      void queryClient.invalidateQueries({ queryKey: ["variants"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      navigate({ to: "/admin/produk/$id", params: { id: encodeURIComponent(r.id) } });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Gagal membuat varian"),
  });

  const list = variants.data?.variants ?? [];
  const num = (k: "price" | "stock" | "weight_grams") => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value.replace(/\D/g, "") }));

  return (
    <section className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-navy">Varian (rasa / ukuran)</h2>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-bold text-primary">
          {open ? "Tutup" : "+ Tambah varian"}
        </button>
      </div>
      {list.length > 1 && (
        <ul className="mt-2 space-y-1">
          {list.map((v) => (
            <li key={v.id}>
              <Link
                to="/admin/produk/$id"
                params={{ id: encodeURIComponent(v.id) }}
                className={`flex justify-between gap-2 rounded-lg px-2 py-1.5 text-xs ${
                  v.id === productId ? "bg-primary/10 font-bold text-primary" : "bg-secondary text-navy"
                }`}
              >
                <span className="truncate">
                  {[v.flavor, v.size].filter(Boolean).join(" · ") || v.sku} — {v.sku}
                </span>
                <span className="shrink-0">
                  {v.price == null ? "Tanpa harga" : formatRp(Number(v.price))} · stok {v.stock}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.length <= 1 && !open && (
        <p className="mt-1 text-xs text-muted-foreground">Belum ada varian lain. Foto & deskripsi disalin ke varian baru.</p>
      )}
      {open && (
        <form
          className="mt-2 grid grid-cols-2 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <input required placeholder="SKU varian" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} className={input} />
          <input placeholder="Rasa" value={form.flavor} onChange={(e) => setForm((f) => ({ ...f, flavor: e.target.value }))} className={input} />
          <input placeholder="Ukuran" value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} className={input} />
          <input inputMode="numeric" placeholder="Harga" value={form.price} onChange={num("price")} className={input} />
          <input inputMode="numeric" placeholder="Stok" value={form.stock} onChange={num("stock")} className={input} />
          <input inputMode="numeric" placeholder="Berat (gram)" value={form.weight_grams} onChange={num("weight_grams")} className={input} />
          <button
            type="submit"
            disabled={mutation.isPending}
            className="col-span-2 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            {mutation.isPending ? "Menyimpan…" : "Buat varian"}
          </button>
        </form>
      )}
    </section>
  );
}
