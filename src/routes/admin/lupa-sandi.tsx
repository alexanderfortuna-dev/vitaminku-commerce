import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RESET_PATH } from "@/lib/password-reset";

export const Route = createFileRoute("/admin/lupa-sandi")({
  head: () => ({
    meta: [
      { title: "Lupa Kata Sandi | VitaminKu" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    // Hasil sengaja tidak dibedakan agar tidak membocorkan email mana yang terdaftar.
    await supabase.auth
      .resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${RESET_PATH}` })
      .catch(() => undefined);
    setBusy(false);
    setSent(true);
  };

  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-sm p-5 card-surface">
        <h1 className="text-lg font-extrabold text-navy">Lupa kata sandi</h1>
        {sent ? (
          <p className="mt-3 text-sm text-primary">
            Jika email tersebut terdaftar, tautan untuk menyetel kata sandi baru sudah dikirim. Periksa kotak masuk
            (juga folder spam). Tautan berlaku sekali pakai.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">Masukkan email akun Seller Center Anda.</p>
            <label className="block">
              <span className="text-xs font-semibold text-navy">Email</span>
              <input
                type="email"
                required
                maxLength={200}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Mengirim…" : "Kirim tautan setel ulang"}
            </button>
          </form>
        )}
        <Link to="/admin/login" search={{ next: undefined }} className="mt-4 block text-center text-xs font-semibold text-muted-foreground underline">
          Kembali ke halaman masuk
        </Link>
      </div>
    </div>
  );
}
