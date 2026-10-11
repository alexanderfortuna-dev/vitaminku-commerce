import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { updateDbAdminProduct } from "@/lib/admin-products.functions";
import { addProductPhoto, createSellerProduct } from "@/lib/seller.functions";
import { compressImage } from "@/lib/image-compress";
import { MAX_PHOTOS } from "@/lib/seller-import";
import { canEditCommerce } from "@/lib/admin-roles";
import { CATEGORIES } from "@/lib/catalog";
import { useAdminRole } from "./route";

const CATEGORY_LIST = CATEGORIES.map((c) => c.category);

export const Route = createFileRoute("/admin/produk/baru")({
  head: () => ({
    meta: [
      { title: "Tambah Produk — Seller Center | VitaminKu" },
      { name: "description", content: "Tambah produk baru ke katalog VitaminKu." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NewProductPage,
});

const inputClass = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm";

function NewProductPage() {
  const navigate = useNavigate();
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as null | "owner" | "admin" | "seller";
  const create = useServerFn(createSellerProduct);
  const addPhoto = useServerFn(addProductPhoto);
  const update = useServerFn(updateDbAdminProduct);
  const [photos, setPhotos] = useState<File[]>([]);
  const [step, setStep] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    brand: "",
    category: CATEGORY_LIST[0] ?? "",
    subcategory: "",
    description: "",
    bpom_number: "",
    sku: "",
    price: "",
    stock: "3",
    weight_grams: "",
    flavor: "",
    size: "",
  });

  const mutation = useMutation({
    mutationFn: async (publish: boolean) => {
      setStep("Menyimpan produk…");
      const { id } = await create({ data: form });
      for (let i = 0; i < photos.length; i++) {
        setStep(`Mengunggah foto ${i + 1}/${photos.length}…`);
        await addPhoto({ data: { id, file: await compressImage(photos[i]!) } });
      }
      let issue: string | null = null;
      if (publish) {
        setStep("Menampilkan…");
        const r = await update({ data: { id, is_active: true } });
        if (!r.product?.is_active) issue = r.product?.publish_issue ?? "Tetap Draf";
      }
      return { id, publish, issue };
    },
    onSuccess: ({ id, publish, issue }) => {
      if (issue) toast.error(`Disimpan sebagai Draf. ${issue}`, { duration: 10000 });
      else toast.success(publish ? "Produk tampil di toko" : "Disimpan sebagai Draf");
      navigate({ to: "/admin/produk/$id", params: { id: encodeURIComponent(id) } });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Gagal membuat produk"),
    onSettled: () => setStep(null),
  });

  if (!canEditCommerce(role)) {
    return <p className="p-4 text-sm text-muted-foreground">Hanya admin dan owner yang dapat menambah produk.</p>;
  }

  const field = (key: keyof typeof form, label: string, opts: { required?: boolean; numeric?: boolean; placeholder?: string } = {}) => (
    <label className="block">
      <span className="text-xs font-semibold text-navy">
        {label}
        {opts.required && <span className="text-destructive"> *</span>}
      </span>
      <input
        required={opts.required}
        inputMode={opts.numeric ? "numeric" : undefined}
        placeholder={opts.placeholder}
        value={form[key]}
        onChange={(e) =>
          setForm((f) => ({ ...f, [key]: opts.numeric ? e.target.value.replace(/\D/g, "") : e.target.value }))
        }
        className={inputClass}
      />
    </label>
  );

  return (
    <div className="px-4 py-4 pb-32">
      <h1 className="text-base font-extrabold text-navy">Tambah Produk</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Agar bisa tampil (Live): harga, minimal 1 foto, dan berat wajib diisi.
      </p>
      <form
        id="new-product"
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          mutation.mutate(submitter?.value === "publish");
        }}
        className="mt-4 space-y-3"
      >
        <label className="block">
          <span className="text-xs font-semibold text-navy">Foto (maks {MAX_PHOTOS}, pertama = sampul)</span>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setPhotos([...(e.target.files ?? [])].slice(0, MAX_PHOTOS))}
            className="mt-1 block w-full text-xs"
          />
          {photos.length > 0 && <span className="text-xs text-muted-foreground">{photos.length} foto dipilih</span>}
        </label>
        {field("name", "Nama produk", { required: true })}
        {field("brand", "Brand", { required: true })}
        <label className="block">
          <span className="text-xs font-semibold text-navy">Kategori</span>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className={inputClass}
          >
            {CATEGORY_LIST.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {field("subcategory", "Subkategori")}
        <label className="block">
          <span className="text-xs font-semibold text-navy">Deskripsi</span>
          <textarea
            rows={5}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          {field("sku", "SKU", { required: true })}
          {field("bpom_number", "No. BPOM (opsional)")}
          {field("price", "Harga (Rp)", { numeric: true })}
          {field("stock", "Stok", { numeric: true })}
          {field("weight_grams", "Berat (gram)", { numeric: true })}
          {field("flavor", "Rasa / varian")}
          {field("size", "Ukuran")}
        </div>
      </form>
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-3xl gap-2 border-t border-border bg-card p-3">
        <button
          form="new-product"
          type="submit"
          value="draft"
          disabled={mutation.isPending}
          className="flex-1 rounded-full bg-secondary px-4 py-3 text-sm font-bold text-navy disabled:opacity-60"
        >
          Simpan Draf
        </button>
        <button
          form="new-product"
          type="submit"
          value="publish"
          disabled={mutation.isPending}
          className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {step ?? "Tampilkan"}
        </button>
      </div>
    </div>
  );
}
