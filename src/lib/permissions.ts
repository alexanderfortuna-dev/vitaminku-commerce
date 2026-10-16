// Cermin TypeScript dari public.has_permission() di drizzle/migrations/0010_permissions_and_customers.sql.
// Ubah KEDUANYA bersamaan; src/lib/__tests__/permissions.db-parity.test.ts menjaga agar tetap sama.
// UI hanya mencerminkan; penegakan sebenarnya ada di server (requirePermission) dan database (RLS / SECURITY DEFINER).
import type { AdminRole } from "./admin-roles";

export const OWNER_ONLY_PERMS = [
  "users_manage",
  "integrations_manage",
  "money_move",
  "hard_delete",
  "customers_export",
  "blocklist_edit",
  "hpp_view",
  "hpp_edit",
  "backup_export",
  "audit_view",
] as const;

export const MANAGER_PERMS = [
  "products_edit",
  "products_photos",
  "products_price_stock",
  "products_weight",
  "products_hero",
  "promos_manage",
  "settings_edit",
  "branches_manage",
  "orders_manage",
  "customers_view",
  "reports_view",
  "uploads_use",
  "links_manage",
] as const;

export const SELLER_PERMS = ["products_edit", "products_photos"] as const;

export type Permission =
  | (typeof OWNER_ONLY_PERMS)[number]
  | (typeof MANAGER_PERMS)[number]
  | (typeof SELLER_PERMS)[number];

export type PermissionSubject = { role: AdminRole | null; canViewHpp?: boolean | null };

export function hasPermission(subject: PermissionSubject, perm: Permission): boolean {
  const { role } = subject;
  if (!role) return false;
  const p: string = perm;
  if (role === "owner") {
    return [...OWNER_ONLY_PERMS, ...MANAGER_PERMS, ...SELLER_PERMS].includes(p as never);
  }
  if (role === "admin") {
    return (MANAGER_PERMS as readonly string[]).includes(p) || (p === "hpp_view" && !!subject.canViewHpp);
  }
  return (SELLER_PERMS as readonly string[]).includes(p);
}

export const TITLE_LABEL: Record<string, string> = {
  general_manager: "General Manager",
  admin: "Admin",
};

/** Label tampilan peran untuk Kings: Owner / Manajer / Seller (judul jabatan hanya label). */
export function roleDisplay(role: AdminRole | null, title?: string | null): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return title && TITLE_LABEL[title] ? `Manajer (${TITLE_LABEL[title]})` : "Manajer";
  if (role === "seller") return "Tim Produk";
  return "Pelanggan";
}
