import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { inviteAdminUser, listAdminUsers, setAdminUserRole } from "@/lib/admin.functions";
import { ROLE_LABEL, type AdminRole } from "@/lib/admin-roles";

export const Route = createFileRoute("/admin/pengguna")({
  head: () => ({
    meta: [
      { title: "Kelola Pengguna — Panel Admin | VitaminKu" },
      { name: "description", content: "Undang tim dan atur peran akses panel admin VitaminKu." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const fetchUsers = useServerFn(listAdminUsers);
  const invite = useServerFn(inviteAdminUser);
  const setRole = useServerFn(setAdminUserRole);

  const [email, setEmail] = useState("");
  const [role, setRoleValue] = useState<AdminRole>("seller");

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    retry: false,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["admin-users"] });

  const inviteMutation = useMutation({
    mutationFn: () => invite({ data: { email, role } }),
    onSuccess: () => {
      toast.success("Undangan dikirim");
      setEmail("");
      invalidate();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Gagal mengundang pengguna"),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { userId: string; role?: AdminRole; isActive?: boolean }) =>
      setRole({ data: input }),
    onSuccess: () => {
      toast.success("Peran diperbarui");
      invalidate();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Gagal memperbarui peran"),
  });

  if (isError) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Daftar pengguna tidak dapat dimuat."}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <h1 className="text-base font-extrabold text-navy">Kelola Pengguna</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          inviteMutation.mutate();
        }}
        className="mt-3 space-y-2 p-3 card-surface"
      >
        <label className="block">
          <span className="text-xs font-semibold text-navy">Undang via email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-navy">Peran</span>
          <select
            value={role}
            onChange={(e) => setRoleValue(e.target.value as AdminRole)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="seller">Seller</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={inviteMutation.isPending}
          className="w-full rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {inviteMutation.isPending ? "Mengirim…" : "Kirim undangan"}
        </button>
      </form>

      {isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Memuat pengguna…</p>
      ) : (data ?? []).length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Belum ada pengguna dengan peran.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {(data ?? []).map((user) => (
            <li key={user.userId} className="p-3 card-surface">
              <p className="truncate text-sm font-semibold text-navy">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                {ROLE_LABEL[user.role]} · {user.isActive ? "Aktif" : "Nonaktif"}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={user.role}
                  onChange={(e) =>
                    updateMutation.mutate({
                      userId: user.userId,
                      role: e.target.value as AdminRole,
                    })
                  }
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="seller">Seller</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    updateMutation.mutate({ userId: user.userId, isActive: !user.isActive })
                  }
                  className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-navy"
                >
                  {user.isActive ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
