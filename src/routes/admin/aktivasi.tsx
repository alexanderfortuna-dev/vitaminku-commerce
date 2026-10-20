import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { activateStaffAccount } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/aktivasi")({
  head: () => ({
    meta: [
      { title: "Aktivasi Akun Staf | VitaminKu" },
      { name: "description", content: "Aktifkan akun staf VitaminKu dengan kode aktivasi dari owner." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StaffActivationPage,
});

const INPUT = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm";

function StaffActivationPage() {
  const activate = useServerFn(activateStaffAccount);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== repeat) {
      setError("Kata sandi dan pengulangannya tidak sama.");
      return;
    }
    setBusy(true);
    try {
      await activate({ data: { email, password, code, displayName } });
      setDone(true);
      setPassword("");
      setRepeat("");
      setCode("");
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Aktivasi gagal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-sm p-5 card-surface">
        <h1 className="text-lg font-extrabold text-navy">Aktivasi Akun Staf</h1>
        {done ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-primary">Akun aktif. Silakan masuk dengan email dan kata sandi yang baru Anda buat.</p>
            <Link
              to="/admin/login"
              search={{ next: undefined }}
              className="block w-full rounded-full bg-primary px-4 py-2.5 text-center text-sm font-bold text-primary-foreground"
            >
              Masuk ke Seller Center
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Gunakan email dan kode aktivasi yang diberikan owner. Kode hanya berlaku untuk email tersebut dan sekali pakai.
              Kata sandi Anda buat sendiri, tidak ada orang lain yang mengetahuinya.
            </p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-navy">Nama tampilan (boleh dikosongkan)</span>
                <input type="text" maxLength={80} autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={INPUT} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-navy">Email</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-navy">Kode aktivasi</span>
                <input
                  type="text"
                  required
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  placeholder="VK-20261104-XXXXX-XXXXX-XXXXX-XXXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={`${INPUT} font-mono`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-navy">Buat kata sandi (minimal 10 karakter)</span>
                <input type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-navy">Ulangi kata sandi</span>
                <input type="password" required minLength={10} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={INPUT} />
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Memproses…" : "Aktifkan akun"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
