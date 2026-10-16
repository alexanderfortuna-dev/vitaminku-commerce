import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getDbAdminProduct, updateDbAdminProduct } from "@/lib/admin-products.functions";
import { createQuickDraft, getQuickProductOptions } from "@/lib/quick-product.functions";
import { addProductPhoto } from "@/lib/seller.functions";
import { compressImage } from "@/lib/image-compress";
import { canEditCommerce } from "@/lib/admin-roles";
import { CATEGORIES } from "@/lib/catalog";
import { hasPermission } from "@/lib/permissions";
import { evaluateReadiness, publishState, readinessSummary } from "@/lib/product-readiness";
import { formatRp } from "@/lib/sheet-io";
import { ReadinessChecklist } from "@/components/admin/ReadinessChecklist";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/produk-cepat")({
  head: () => ({
    meta: [
      { title: "Tambah Produk Cepat — Seller Center | VitaminKu" },
      { name: "description", content: "Tambah produk dari ponsel: foto, nama, harga, stok, merek, kategori. Disimpan sebagai Draf." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: QuickProductPage,
});

type Role = null | "owner" | "admin" | "seller";

const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-base";
const OTHER_BRAND = "__lain__";

function QuickProductPage() {
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as Role;
  if (roleQuery.isPending) return <p className="p-4 text-sm text-muted-foreground">Memuat…</p>;
  if (!hasPermission({ role }, "products_edit")) {
    return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk tim produk, admin, dan owner.</p>;
  }
  return <QuickProductFlow role={role} />;
}

function QuickProductFlow({ role }: { role: Role }) {
  const [savedId, setSavedId] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  if (savedId) {
    return (
      <SavedPanel
        productId={savedId}
        role={role}
        onAgain={() => {
          setSavedId(null);
          setRound((n) => n + 1);
        }}
      />
    );
  }
  return <QuickForm key={round} role={role} onSaved={setSavedId} />;
}

function QuickForm({ role, onSaved }: { role: Role; onSaved: (id: string) => void }) {
  const queryClient = useQueryClient();
  const fetchOptions = useServerFn(getQuickProductOptions);
  const create = useServerFn(createQuickDraft);
  const addPhoto = useServerFn(addProductPhoto);

  const canPriceStock = hasPermission({ role }, "products_price_stock");
  const canWeight = hasPermission({ role }, "products_weight");

  const options = useQuery({
    queryKey: ["quick-product-options"],
    queryFn: () => fetchOptions(),
    staleTime: 600_000,
    retry: false,
  });
  const brands = options.data?.brands ?? [];
  const categories = useMemo(() => {
    const all = new Set<string>([...CATEGORIES.map((c) => c.category), ...(options.data?.categories ?? [])]);
    return [...all].sort((a, b) => a.localeCompare(b, "id"));
  }, [options.data?.categories]);

  const [form, setForm] = useState({ name: "", brand: "", brandOther: "", category: "", price: "", stock: "", weight: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  // Setelah draf terbentuk, id disimpan agar coba-ulang (mis. foto gagal) tidak membuat produk ganda.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [photoDone, setPhotoDone] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const brandValue = form.brand === OTHER_BRAND ? form.brandOther.trim() : form.brand;
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const setDigits = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value.replace(/\D/g, "") }));

  const locked = createdId !== null;
  const formOk = form.name.trim() !== "" && brandValue !== "" && form.category !== "";

  const save = useMutation({
    mutationFn: async () => {
      let id = createdId;
      if (!id) {
        setStep("Menyimpan draf…");
        const r = await create({
          data: {
            name: form.name,
            brand: brandValue,
            category: form.category,
            price: canPriceStock ? form.price : undefined,
            stock: canPriceStock ? form.stock : undefined,
            weight_grams: canWeight ? form.weight : undefined,
          },
        });
        id = r.id;
        setCreatedId(id);
      }
      if (photo && !photoDone) {
        setStep("Mengunggah foto…");
        await addPhoto({ data: { id, file: await compressImage(photo) } });
        setPhotoDone(true);
      }
      return id;
    },
    onSuccess: (id) => {
      toast.success("Tersimpan sebagai Draf. Belum tayang.");
      void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      void queryClient.invalidateQueries({ queryKey: ["work-queue"] });
      onSaved(id);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan", { duration: 8000 });
    },
    onSettled: () => setStep(null),
  });

  const pickPhoto = (files: FileList | null) => {
    const f = files?.[0];
    if (f) setPhoto(f);
  };

  return (
    <div className="px-4 py-4 pb-32">
      <h1 className="text-base font-extrabold text-navy">Tambah Produk Cepat</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Disimpan sebagai Draf, tidak langsung tayang. Setelah itu cek daftar &quot;Siap Tayang&quot;.
      </p>
      {role === "seller" && (
        <p className="mt-2 rounded-xl border border-border bg-secondary p-3 text-xs text-navy">
          Catatan: saat ini database hanya mengizinkan admin/owner membuat produk baru. Jika ditolak, minta admin
          membuatnya, lalu lengkapi foto lewat Antrian Kerja.
        </p>
      )}

      <form
        id="quick-product"
        onSubmit={(e) => {
          e.preventDefault();
          if (!formOk || save.isPending) return;
          save.mutate();
        }}
        className="mt-4"
      >
        <fieldset disabled={locked || save.isPending} className="space-y-4">
          <div>
            <span className="text-xs font-semibold text-navy">Foto produk</span>
            <div className="mt-1 flex items-center gap-3">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-secondary text-muted-foreground">
                {preview ? (
                  <img src={preview} alt="Foto produk yang dipilih" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-6 w-6" aria-hidden />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  <Camera className="h-4 w-4" aria-hidden /> {photo ? "Foto ulang" : "Ambil foto"}
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-secondary px-4 text-sm font-bold text-navy disabled:opacity-60"
                >
                  <ImagePlus className="h-4 w-4" aria-hidden /> Pilih dari galeri
                </button>
              </div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  pickPhoto(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  pickPhoto(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-navy">
              Nama produk<span className="text-destructive"> *</span>
            </span>
            <input
              required
              value={form.name}
              onChange={set("name")}
              autoComplete="off"
              placeholder="mis. Vitamin C 1000 mg isi 60"
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            {canPriceStock && (
              <label className="block">
                <span className="text-xs font-semibold text-navy">Harga (Rp)</span>
                <input inputMode="numeric" value={form.price} onChange={setDigits("price")} className={inputClass} />
                {form.price !== "" && (
                  <span className="text-[11px] text-muted-foreground">{formatRp(Number(form.price))}</span>
                )}
              </label>
            )}
            {canPriceStock && (
              <label className="block">
                <span className="text-xs font-semibold text-navy">Stok</span>
                <input inputMode="numeric" value={form.stock} onChange={setDigits("stock")} placeholder="0" className={inputClass} />
              </label>
            )}
            {canWeight && (
              <label className="col-span-2 block">
                <span className="text-xs font-semibold text-navy">Berat (gram), wajib agar bisa tayang</span>
                <input
                  inputMode="numeric"
                  value={form.weight}
                  onChange={setDigits("weight")}
                  placeholder="mis. 250"
                  className={inputClass}
                />
              </label>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-navy">
              Merek<span className="text-destructive"> *</span>
            </span>
            <select required value={form.brand} onChange={set("brand")} className={inputClass}>
              <option value="">{options.isPending ? "Memuat merek…" : "Pilih merek"}</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value={OTHER_BRAND}>Merek lain…</option>
            </select>
            {form.brand === OTHER_BRAND && (
              <input
                required
                value={form.brandOther}
                onChange={set("brandOther")}
                placeholder="Ketik nama merek"
                className={inputClass}
              />
            )}
            {options.isError && (
              <span className="text-[11px] text-destructive">Daftar merek gagal dimuat. Pilih &quot;Merek lain…&quot;.</span>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-navy">
              Kategori<span className="text-destructive"> *</span>
            </span>
            <select required value={form.category} onChange={set("category")} className={inputClass}>
              <option value="">Pilih kategori</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-3xl border-t border-border bg-card p-3">
        {locked && !save.isPending && (
          <button
            type="button"
            onClick={() => onSaved(createdId)}
            className="mb-2 min-h-11 w-full rounded-full bg-secondary px-4 text-sm font-bold text-navy"
          >
            Lanjut tanpa foto
          </button>
        )}
        <button
          form="quick-product"
          type="submit"
          disabled={!formOk || save.isPending}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {step ?? (locked ? "Coba unggah foto lagi" : "Simpan sebagai Draf")}
        </button>
      </div>
    </div>
  );
}

function SavedPanel({ productId, role, onAgain }: { productId: string; role: Role; onAgain: () => void }) {
  const queryClient = useQueryClient();
  const fetchProduct = useServerFn(getDbAdminProduct);
  const update = useServerFn(updateDbAdminProduct);
  const canPublish = canEditCommerce(role);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["admin-product", productId],
    queryFn: () => fetchProduct({ data: { id: productId } }),
    retry: false,
  });
  const product = data?.product ?? null;

  const publish = useMutation({
    mutationFn: () => update({ data: { id: productId, is_active: true } }),
    onSuccess: (r) => {
      if (r.blocked) toast.error("Produk ini terlarang dan tetap tidak tampil.");
      else if (r.product?.is_active) toast.success("Produk sudah tayang di toko");
      else toast.error(`Tetap Draf. ${r.product?.publish_issue ?? "Database menolak."}`, { duration: 10000 });
      void queryClient.invalidateQueries({ queryKey: ["admin-product", productId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      void queryClient.invalidateQueries({ queryKey: ["work-queue"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Gagal menayangkan"),
  });

  if (isPending) return <p className="p-4 text-sm text-muted-foreground">Memeriksa kelengkapan…</p>;
  if (isError || !product) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          {isError && error instanceof Error ? error.message : "Produk tidak ditemukan."}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 min-h-11 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  const result = evaluateReadiness(product);
  const state = publishState(product);

  return (
    <div className="px-4 py-4 pb-32">
      <h1 className="text-base font-extrabold text-navy">{state === "live" ? "Produk tayang" : "Draf tersimpan"}</h1>
      <p className="mt-1 truncate text-sm font-semibold text-navy">{product.name}</p>
      <p className="truncate text-xs text-muted-foreground">
        {product.sku} · {product.brand || "Tanpa merek"}
      </p>

      <h2 className="mt-5 text-sm font-extrabold text-navy">Siap Tayang</h2>
      <p className="mb-2 text-xs text-muted-foreground">{readinessSummary(result)}</p>
      <ReadinessChecklist productId={productId} result={result} />

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-3xl space-y-2 border-t border-border bg-card p-3">
        <button
          type="button"
          disabled={state !== "ready" || !canPublish || publish.isPending}
          onClick={() => publish.mutate()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {publish.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {state === "live" ? "Sudah tayang" : "Tayangkan"}
        </button>
        {!canPublish && state !== "live" && (
          <p className="text-center text-[11px] text-muted-foreground">Hanya admin/owner yang bisa menayangkan produk.</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAgain}
            className="min-h-11 flex-1 rounded-full bg-secondary px-4 text-sm font-bold text-navy"
          >
            Tambah lagi
          </button>
          <Link
            to="/admin/produk/$id"
            params={{ id: encodeURIComponent(productId) }}
            className="grid min-h-11 flex-1 place-items-center rounded-full bg-secondary px-4 text-sm font-bold text-navy"
          >
            Buka produk
          </Link>
        </div>
      </div>
    </div>
  );
}
