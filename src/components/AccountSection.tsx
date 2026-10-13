import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccount, saveMyAccount } from "@/lib/auth-customer.functions";
import { formatIDR } from "@/lib/format";

const STAGE_LABEL: Record<string, string> = {
  baru: "Baru",
  dikonfirmasi: "Dikonfirmasi",
  dikemas: "Dikemas",
  dikirim: "Dikirim",
  selesai: "Selesai",
  batal: "Dibatalkan",
};

/** Blok akun di /akun: masuk (tautan email) atau riwayat pesanan + data tersimpan. Belanja tetap bisa tanpa akun. */
export function AccountSection() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (signedIn === null) return null;
  if (!signedIn) {
    return (
      <div className="mx-4 mb-4 p-4 card-surface">
        <p className="text-sm font-bold text-navy">Simpan data & lihat riwayat pesanan</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Masuk dengan tautan email (tanpa kata sandi). Belanja tetap bisa tanpa akun.
        </p>
        <Link
          to="/masuk"
          search={{ next: undefined, token: undefined }}
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
        >
          Masuk
        </Link>
      </div>
    );
  }
  return <SignedInAccount />;
}

function SignedInAccount() {
  const fetchMe = useServerFn(getMyAccount);
  const save = useServerFn(saveMyAccount);
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["my-account"],
    queryFn: () => fetchMe(),
    retry: false,
  });
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.customer) {
      setName(data.customer.name);
      setAddress(data.customer.address ?? "");
      setOptIn(data.customer.marketingOptIn);
    }
  }, [data]);

  if (isPending) return <p className="px-4 pb-4 text-xs text-muted-foreground">Memuat akun…</p>;
  if (isError || !data) {
    return <p className="px-4 pb-4 text-xs text-muted-foreground">Akun belum bisa dimuat.</p>;
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ data: { name, address, marketingOptIn: optIn } });
      toast.success("Data tersimpan");
      await qc.invalidateQueries({ queryKey: ["my-account"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-4 mb-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">Masuk sebagai {data.email}</p>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="min-h-11 shrink-0 rounded-full bg-secondary px-4 text-xs font-bold text-navy"
        >
          Keluar
        </button>
      </div>

      {!data.customer ? (
        <p className="p-4 text-sm text-muted-foreground card-surface">
          Belum ada data tersimpan. Setelah pesanan pertama selesai, ketuk “Simpan data saya” di halaman
          pesanan agar riwayat muncul di sini.
        </p>
      ) : (
        <>
          <form onSubmit={onSave} className="space-y-2 p-4 card-surface">
            <p className="text-sm font-bold text-navy">Data saya</p>
            <label className="block text-xs font-semibold text-navy">
              Nama
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </label>
            <p className="text-xs text-muted-foreground">WhatsApp: {data.customer.whatsapp}</p>
            <label className="block text-xs font-semibold text-navy">
              Alamat tersimpan
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-xs text-navy">
              <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
              Kirimi saya info promo lewat WhatsApp
            </label>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
          </form>

          <div className="p-4 card-surface">
            <p className="text-sm font-bold text-navy">Pesanan saya</p>
            {data.orders.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Belum ada pesanan.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {data.orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      to="/pesanan/$token"
                      params={{ token: o.accessToken }}
                      className="flex min-h-11 items-center justify-between gap-2 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-navy">
                          {o.orderNumber}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-bold text-navy">{formatIDR(o.total)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {STAGE_LABEL[o.stage] ?? o.stage}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
