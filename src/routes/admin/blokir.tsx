import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addBlock, listBlocklist, removeBlock } from "@/lib/seller.functions";
import { canEditCommerce } from "@/lib/admin-roles";
import { useAdminRole } from "./route";

export const Route = createFileRoute("/admin/blokir")({
  head: () => ({
    meta: [
      { title: "Daftar Blokir — Seller Center | VitaminKu" },
      { name: "description", content: "Kata kunci dan SKU yang tidak boleh dijual online di VitaminKu." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BlocklistPage,
});

// Stored patterns are regexes; show them readable.
const readable = (p: string) => p.replace(/\\[mM]/g, "").replace(/-\?/g, "-").replace(/s\?/g, "(s)").replace(/\\(.)/g, "$1");

function BlocklistPage() {
  const roleQuery = useAdminRole();
  const role = (roleQuery.data?.role ?? null) as null | "owner" | "admin" | "seller";
  const fetchList = useServerFn(listBlocklist);
  const add = useServerFn(addBlock);
  const remove = useServerFn(removeBlock);
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"keyword" | "sku">("keyword");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const list = useQuery({ queryKey: ["blocklist"], queryFn: () => fetchList(), enabled: canEditCommerce(role) });
  const isOwner = role === "owner";
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["blocklist"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  const addMut = useMutation({
    mutationFn: () => add({ data: { kind, value, reason } }),
    onSuccess: (r) => {
      toast.success(`Ditambahkan. ${r.productsBlocked} produk diperiksa ulang.`);
      setValue("");
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });
  const removeMut = useMutation({
    mutationFn: (v: { kind: "keyword" | "sku"; value: string }) => remove({ data: v }),
    onSuccess: () => {
      toast.success("Dihapus dari daftar blokir");
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });

  if (!canEditCommerce(role)) return <p className="p-4 text-sm text-muted-foreground">Halaman ini hanya untuk admin/owner.</p>;

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <h1 className="text-base font-extrabold text-navy">Daftar Blokir</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Produk yang nama/brand/kategori/deskripsinya cocok, atau SKU-nya ada di sini, otomatis berstatus Diblokir dan tidak bisa
          ditampilkan. {list.data ? `${list.data.blockedProducts} produk saat ini diblokir.` : ""}
        </p>
        {!isOwner && <p className="mt-1 text-xs font-semibold text-navy">Hanya owner yang dapat mengubah daftar ini.</p>}
      </div>

      {isOwner && (
        <form className="space-y-2 p-3 card-surface" onSubmit={(e) => { e.preventDefault(); addMut.mutate(); }}>
          <div className="flex gap-2">
            {(["keyword", "sku"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${kind === k ? "bg-primary text-primary-foreground" : "bg-secondary text-navy"}`}>
                {k === "keyword" ? "Kata kunci" : "SKU"}
              </button>
            ))}
          </div>
          <input required value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={kind === "keyword" ? "mis. tadalafil" : "mis. SKU-123"}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          <input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan (mis. Obat keras)"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          <button type="submit" disabled={addMut.isPending}
            className="w-full rounded-full bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">
            Tambah ke daftar blokir
          </button>
        </form>
      )}

      {list.isPending ? (
        <p className="text-sm text-muted-foreground">Memuat…</p>
      ) : list.isError ? (
        <p className="text-sm text-muted-foreground">{list.error instanceof Error ? list.error.message : "Gagal memuat"}</p>
      ) : (
        <>
          <section>
            <h2 className="text-sm font-bold text-navy">Kata kunci ({list.data.keywords.length})</h2>
            <ul className="mt-2 space-y-1">
              {list.data.keywords.map((k) => (
                <li key={k.pattern} className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-xs">
                  <span className="min-w-0"><b className="text-navy">{readable(k.pattern)}</b> <span className="text-muted-foreground">· {k.reason}</span></span>
                  {isOwner && (
                    <button type="button" aria-label={`Hapus ${readable(k.pattern)}`} disabled={removeMut.isPending}
                      onClick={() => { if (confirm(`Hapus "${readable(k.pattern)}" dari daftar blokir?`)) removeMut.mutate({ kind: "keyword", value: k.pattern }); }}
                      className="shrink-0 text-destructive"><Trash2 className="h-4 w-4" /></button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-sm font-bold text-navy">SKU ({list.data.skus.length})</h2>
            {list.data.skus.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Belum ada SKU diblokir.</p>}
            <ul className="mt-2 space-y-1">
              {list.data.skus.map((s) => (
                <li key={s.sku} className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-xs">
                  <span><b className="text-navy">{s.sku}</b> <span className="text-muted-foreground">· {s.reason}</span></span>
                  {isOwner && (
                    <button type="button" aria-label={`Hapus ${s.sku}`} disabled={removeMut.isPending}
                      onClick={() => removeMut.mutate({ kind: "sku", value: s.sku })} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
