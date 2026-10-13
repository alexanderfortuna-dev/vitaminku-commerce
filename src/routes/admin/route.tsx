import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Link2, ListChecks, PlusCircle, Store, History, Images, LogOut, Package, Receipt,
  Tag, Settings, Sheet, ShieldBan, Upload, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyAdminRole } from "@/lib/admin.functions";
import { ROLE_LABEL, canEditCommerce, canEditContent, canManageUsers, type AdminRole } from "@/lib/admin-roles";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (location.pathname.startsWith("/admin/login")) return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/admin/login", search: { next: location.pathname } });
    }
  },
  component: AdminLayout,
  errorComponent: ({ error }) => (
    <div className="p-4">
      <p className="text-sm font-semibold text-navy">Panel admin gagal dimuat</p>
      <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

export function useAdminRole() {
  const fetchRole = useServerFn(getMyAdminRole);
  return useQuery({
    queryKey: ["admin-role"],
    queryFn: () => fetchRole(),
    retry: false,
    staleTime: 60_000,
  });
}

function AdminLayout() {
  const router = useRouter();
  const isLogin = router.state.location.pathname.startsWith("/admin/login");
  const { data, isPending, isError, error } = useAdminRole();

  if (isLogin) return <Outlet />;

  if (isPending) {
    return <p className="p-4 text-sm text-muted-foreground">Memuat panel admin…</p>;
  }

  if (isError) {
    return (
      <div className="p-4">
        <p className="text-sm font-semibold text-navy">Tidak bisa membuka panel admin</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Terjadi kesalahan."}
        </p>
      </div>
    );
  }

  const role = data?.role as AdminRole | null;

  if (!role) {
    return (
      <div className="p-4">
        <p className="text-sm font-semibold text-navy">Akses ditolak</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Akun {data?.email} belum memiliki peran admin. Minta owner untuk memberi akses.
        </p>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            router.navigate({ to: "/admin/login", search: { next: undefined }, replace: true });
          }}
          className="mt-4 rounded-full bg-secondary px-4 py-2 text-sm font-bold text-navy"
        >
          Keluar
        </button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-navy">Seller Center</p>
          <p className="truncate text-xs text-muted-foreground">
            {data?.email} · {ROLE_LABEL[role]}
          </p>
        </div>
        <button
          type="button"
          aria-label="Keluar"
          onClick={async () => {
            await supabase.auth.signOut();
            router.navigate({ to: "/admin/login", search: { next: undefined }, replace: true });
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-navy"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>
      <nav className="sticky top-[57px] z-10 flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2" aria-label="Menu Seller Center">
        {NAV.filter((n) => n.show(role)).map((n) => (
          <Link
            key={n.to}
            to={n.to}
            activeOptions={{ exact: n.to === "/admin" }}
            activeProps={{ className: "bg-primary text-primary-foreground" }}
            inactiveProps={{ className: "bg-secondary text-navy" }}
            className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold"
          >
            <n.icon className="h-3.5 w-3.5" /> {n.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

const NAV = [
  { to: "/admin/pesanan-masuk", label: "Pesanan Masuk", icon: BellRing, show: canEditCommerce },
  { to: "/admin/produk-cepat", label: "Tambah Cepat", icon: PlusCircle, show: canEditContent },
  { to: "/admin/antrian", label: "Antrian Kerja", icon: ListChecks, show: canEditContent },
  { to: "/admin", label: "Produk Saya", icon: Package, show: canEditCommerce },
  { to: "/admin/upload-massal", label: "Upload Massal", icon: Upload, show: canEditCommerce },
  { to: "/admin/harga-stok", label: "Ubah Massal", icon: Sheet, show: canEditCommerce },
  { to: "/admin/foto-massal", label: "Foto Massal", icon: Images, show: canEditCommerce },
  { to: "/admin/pesanan", label: "Pesanan", icon: Receipt, show: canEditCommerce },
  { to: "/admin/promo", label: "Promo", icon: Tag, show: canEditCommerce },
  { to: "/admin/blokir", label: "Daftar Blokir", icon: ShieldBan, show: canEditCommerce },
  { to: "/admin/cabang-admin", label: "Cabang & Admin", icon: Store, show: canEditCommerce },
  { to: "/admin/tautan", label: "Tautan & QR", icon: Link2, show: canEditCommerce },
  { to: "/admin/pengaturan", label: "Pengaturan", icon: Settings, show: canEditCommerce },
  { to: "/admin/aktivitas", label: "Log Aktivitas", icon: History, show: canManageUsers },
  { to: "/admin/pengguna", label: "Pengguna", icon: Users, show: canManageUsers },
] as const;
