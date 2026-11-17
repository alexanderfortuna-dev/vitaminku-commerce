import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PASSWORD_MIN, recoveryLinkError, validateNewPassword } from "@/lib/password-reset";

export const Route = createFileRoute("/admin/setel-sandi")({
  head: () => ({
    meta: [
      { title: "Setel Kata Sandi Baru | VitaminKu" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

const INPUT = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hashError = recoveryLinkError(window.location.hash);
    if (hashError) {
      setLinkError(hashError);
      return;
    }
    // Klien Supabase membaca token dari tautan email; tunggu sesi pemulihan aktif.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else if (!window.location.hash.includes("access_token")) {
        setLinkError("Buka halaman ini dari tautan di email setel ulang kata sandi.");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const invalid = validateNewPassword(password, repeat);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError("Kata sandi gagal disimpan. Minta tautan baru lalu coba lagi.");
      return;
    }
    // Keluar dari semua perangkat agar sesi lama tidak berlaku, lalu masuk ulang dengan sandi baru.
    await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
    navigate({ to: "/admin/login", search: { next: undefined }, replace: true });
  };

  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-sm p-5 card-surface">
        <h1 className="text-lg font-extrabold text-navy">Setel kata sandi baru</h1>
        {linkError ? (
          <>
            <p className="mt-3 text-sm text-destructive">{linkError}</p>
            <Link to="/admin/lupa-sandi" className="mt-4 block text-center text-sm font-semibold text-primary underline">
              Minta tautan baru
            </Link>
          </>
        ) : !ready ? (
          <p className="mt-3 text-sm text-muted-foreground">Memeriksa tautan…</p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-navy">Kata sandi baru (min. {PASSWORD_MIN} karakter)</span>
              <input type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-navy">Ulangi kata sandi baru</span>
              <input type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={INPUT} />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">
              {busy ? "Menyimpan…" : "Simpan kata sandi baru"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
