// Logika murni "Lupa kata sandi" staf (diuji di __tests__/password-reset.test.ts).
export const RESET_PATH = "/admin/setel-sandi";
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

/** Pesan galat untuk kata sandi baru, atau null bila valid (aturan sama dengan aktivasi staf). */
export function validateNewPassword(password: string, repeat: string): string | null {
  if (password.length < PASSWORD_MIN) return `Kata sandi minimal ${PASSWORD_MIN} karakter.`;
  if (password.length > PASSWORD_MAX) return `Kata sandi maksimal ${PASSWORD_MAX} karakter.`;
  if (password !== repeat) return "Kata sandi dan pengulangannya tidak sama.";
  return null;
}

/**
 * Bila tautan pemulihan Supabase mendarat di halaman lain (mis. redirect jatuh ke Site URL),
 * kembalikan alamat halaman setel sandi beserta hash-nya; selain itu null.
 */
export function recoveryRedirectTarget(pathname: string, hash: string): string | null {
  if (pathname === RESET_PATH) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("type") === "recovery" ? `${RESET_PATH}${hash}` : null;
}

/** Pesan manusiawi untuk galat di hash tautan (kedaluwarsa/tidak sah), atau null. */
export function recoveryLinkError(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = params.get("error_code") ?? params.get("error");
  if (!code) return null;
  if (code === "otp_expired") return "Tautan sudah kedaluwarsa. Minta tautan baru di halaman Lupa kata sandi.";
  return "Tautan tidak sah atau sudah dipakai. Minta tautan baru di halaman Lupa kata sandi.";
}
