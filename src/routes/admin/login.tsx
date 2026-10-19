import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { activateBootstrapOwner } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Masuk Seller Center | VitaminKu" },
      { name: "description", content: "Halaman masuk internal tim VitaminKu." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search["next"] === "string" ? search["next"] : undefined,
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "activate">("login");
  const [notice, setNotice] = useState<string | null>(null);
  const activate = useServerFn(activateBootstrapOwner);

  const activateOwner = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await activate({ data: { email, password, code } });
      setNotice("Akun owner aktif. Silakan masuk dengan kata sandi tersebut.");
      setCode("");
      setMode("login");
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Aktivasi gagal.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError("Email atau kata sandi salah.");
      return;
    }
    const target = next && next.startsWith("/admin") ? next : "/admin";
    navigate({ to: target, replace: true });
  };

  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-sm p-5 card-surface">
        <h1 className="text-lg font-extrabold text-navy">Masuk Seller Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Khusus tim VitaminKu. Tidak ada pendaftaran publik — akun dibuat oleh owner.
        </p>
        <form onSubmit={mode === "login" ? submit : activateOwner} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-navy">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-navy">Kata sandi</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          {mode === "activate" && (
            <label className="block">
              <span className="text-xs font-semibold text-navy">Kode aktivasi</span>
              <input
                type="password"
                required
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Kode rahasia aktivasi owner, disimpan di pengaturan rahasia proyek.
              </span>
            </label>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-primary">{notice}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Aktifkan akun owner"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "activate" : "login");
              setError(null);
              setNotice(null);
            }}
            className="w-full text-xs font-semibold text-muted-foreground underline"
          >
            {mode === "login" ? "Aktivasi pertama akun owner" : "Kembali ke form masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
