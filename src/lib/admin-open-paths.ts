// Halaman /admin yang boleh dibuka tanpa masuk. Pencocokan EKSAK (atau anak rutenya), bukan awalan huruf,
// supaya rute baru berawalan mirip (mis. /admin/aktivitas) tidak ikut terbuka.
export const ADMIN_OPEN_PATHS = ["/admin/login", "/admin/aktivasi"] as const;

export function isAdminOpenPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ADMIN_OPEN_PATHS.some((open) => path === open || path.startsWith(`${open}/`));
}
