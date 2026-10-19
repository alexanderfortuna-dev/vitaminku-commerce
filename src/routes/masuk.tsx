import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { completeLogin, safeNext } from "@/lib/auth-customer.functions";

export const Route = createFileRoute("/masuk")({
  head: () => ({
    meta: [
      { title: "Masuk | VitaminKu" },
      { name: "description", content: "Masuk tanpa kata sandi lewat tautan di email." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search["next"] === "string" ? search["next"] : undefined,
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  component: MasukPage,
});

const GOOGLE_ENABLED = import.meta.env["VITE_GOOGLE_LOGIN"] === "true";

function MasukPage() {
  const { next, token } = Route.useSearch();
  const finish = useServerFn(completeLogin);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setelah pelanggan menekan tautan di email, sesi terbentuk: selesaikan login lalu arahkan.
  useEffect(() => {
    let done = false;
    async function go() {
      if (done) return;
      done = true;
      try {
        const res = await finish({ data: token ? { orderToken: token } : {} });
        window.location.replace(res.staff ? "/admin" : safeNext(next));
      } catch {
        done = false;
        setError("Login belum bisa diselesaikan. Coba minta tautan baru.");
      }
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void go();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void go();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function redirectUrl() {
    const q = new URLSearchParams();
    if (next) q.set("next", safeNext(next));
    if (token) q.set("token", token);
    const qs = q.toString();
    return `${window.location.origin}/masuk${qs ? `?${qs}` : ""}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true },
    });
    setBusy(false);
    if (err) {
      setError("Tautan belum bisa dikirim. Periksa email Anda lalu coba lagi.");
      return;
    }
    setSent(true);
  }

  async function google() {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl() },
    });
    if (err) setError("Masuk dengan Google belum tersedia.");
  }

  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-sm p-5 card-surface">
        <h1 className="text-lg font-extrabold text-navy">Masuk / Simpan data saya</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tanpa kata sandi. Kami kirim tautan ke email Anda; ketuk tautan itu untuk masuk. Belanja
          tetap bisa tanpa akun.
        </p>
        {sent ? (
          <div className="mt-5 rounded-xl bg-secondary p-4 text-sm text-navy">
            <Mail className="mb-2 h-5 w-5 text-primary" />
            Tautan sudah dikirim ke <b>{email}</b>. Buka email Anda lalu ketuk tautannya (cek folder
            Spam bila belum ada).
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-navy">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 w-full rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Mengirim…" : "Kirim tautan masuk"}
            </button>
            {GOOGLE_ENABLED && (
              <button
                type="button"
                onClick={() => void google()}
                className="min-h-11 w-full rounded-full bg-secondary px-4 text-sm font-bold text-navy"
              >
                Masuk dengan Google
              </button>
            )}
          </form>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Tim VitaminKu juga bisa masuk di sini (akan diarahkan ke Seller Center). Atau gunakan{" "}
          <a className="underline" href="/admin/login">
            halaman masuk admin
          </a>
          .
        </p>
      </div>
    </div>
  );
}
