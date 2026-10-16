export type AdminRole = "owner" | "admin" | "seller";

export const ROLE_LEVEL: Record<AdminRole, number> = { seller: 1, admin: 2, owner: 3 };

export const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Owner",
  admin: "Manajer",
  seller: "Tim Produk",
};

export function canEditContent(role: AdminRole | null) {
  return role != null;
}
export function canEditCommerce(role: AdminRole | null) {
  return role != null && ROLE_LEVEL[role] >= ROLE_LEVEL.admin;
}
export function canManageUsers(role: AdminRole | null) {
  return role === "owner";
}
