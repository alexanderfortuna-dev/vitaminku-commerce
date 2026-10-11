import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addProductPhoto, setProductImages } from "@/lib/seller.functions";
import { compressImage } from "@/lib/image-compress";
import { MAX_PHOTOS } from "@/lib/seller-import";

/** Up to 9 photos: drag-drop or pick, reorder, first photo = cover. */
export function PhotoGallery({ productId, images }: { productId: string; images: string[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const add = useServerFn(addProductPhoto);
  const setImages = useServerFn(setProductImages);
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-product", productId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const room = MAX_PHOTOS - images.length;
      const list = files.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, room));
      if (!list.length) throw new Error(room <= 0 ? `Maksimal ${MAX_PHOTOS} foto.` : "Pilih file gambar.");
      for (let i = 0; i < list.length; i++) {
        setProgress(`Mengunggah ${i + 1}/${list.length}…`);
        await add({ data: { id: productId, file: await compressImage(list[i]!) } });
      }
      return list.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} foto diunggah`);
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Gagal mengunggah foto"),
    onSettled: () => setProgress(null),
  });

  const reorder = useMutation({
    mutationFn: (next: string[]) => setImages({ data: { id: productId, images: next } }),
    onSuccess: refresh,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan urutan"),
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    reorder.mutate(next);
  };

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-extrabold text-navy">Foto produk</h2>
        <span className="text-xs text-muted-foreground">
          {images.length}/{MAX_PHOTOS} · foto pertama = sampul
        </span>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (dragIndex === null && e.dataTransfer.files.length) upload.mutate([...e.dataTransfer.files]);
        }}
        className={`mt-2 grid grid-cols-3 gap-2 rounded-2xl border-2 border-dashed p-2 ${
          dragOver ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        {images.map((url, i) => (
          <div
            key={url}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDrop={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              e.stopPropagation();
              move(dragIndex, i);
              setDragIndex(null);
            }}
            className="relative overflow-hidden rounded-xl bg-secondary"
          >
            <img src={url} alt={`Foto ${i + 1}`} className="aspect-square w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                Sampul
              </span>
            )}
            <div className="absolute inset-x-1 bottom-1 flex justify-between">
              <button
                type="button"
                aria-label="Geser ke kiri"
                disabled={i === 0 || reorder.isPending}
                onClick={() => move(i, i - 1)}
                className="grid h-7 w-7 place-items-center rounded-full bg-card text-navy disabled:opacity-30"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Hapus foto"
                disabled={reorder.isPending}
                onClick={() => reorder.mutate(images.filter((u) => u !== url))}
                className="grid h-7 w-7 place-items-center rounded-full bg-card text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Geser ke kanan"
                disabled={i === images.length - 1 || reorder.isPending}
                onClick={() => move(i, i + 1)}
                className="grid h-7 w-7 place-items-center rounded-full bg-card text-navy disabled:opacity-30"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {images.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={upload.isPending}
            className="grid aspect-square place-items-center rounded-xl bg-secondary text-center text-xs font-semibold text-navy"
          >
            <span className="flex flex-col items-center gap-1">
              <Camera className="h-5 w-5" />
              {progress ?? "Tambah / seret foto"}
            </span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) upload.mutate(files);
        }}
      />
    </section>
  );
}
