// Tema terang/gelap. Murni & bisa diuji: urutan = pilihan tersimpan → setelan sistem → terang.
// Dipasang sebelum halaman digambar (skrip inline di <head>) agar tidak ada kedipan putih saat muat ulang.

export const THEME_KEY = "vitaminku-theme";
export type Theme = "light" | "dark";
export type ThemeChoice = Theme | "system";

/** Warna bilah browser/PWA per tema (meta theme-color). */
export const THEME_COLOR: Record<Theme, string> = { light: "#16a34a", dark: "#0f172a" };

export function resolveTheme(saved: string | null | undefined, prefersDark: boolean): Theme {
  if (saved === "dark" || saved === "light") return saved;
  return prefersDark ? "dark" : "light";
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readThemeChoice(storage?: StorageLike | null): ThemeChoice {
  try {
    const v = (storage ?? localStorage).getItem(THEME_KEY);
    return v === "dark" || v === "light" ? v : "system";
  } catch {
    return "system";
  }
}

export function writeThemeChoice(choice: ThemeChoice, storage?: StorageLike | null): void {
  try {
    const s = storage ?? localStorage;
    if (choice === "system") s.removeItem(THEME_KEY);
    else s.setItem(THEME_KEY, choice);
  } catch {
    /* penyimpanan tidak tersedia: tema tetap berlaku untuk sesi ini */
  }
}

/** Terapkan ke dokumen: kelas .dark, color-scheme, dan meta theme-color. */
export function applyTheme(theme: Theme, doc: Document = document): void {
  const root = doc.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
}

export function currentTheme(doc: Document = document): Theme {
  return doc.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Skrip inline sebelum CSS dimuat: baca pilihan tersimpan atau setelan sistem lalu pasang kelas .dark.
 * Dibuat dari konstanta yang sama agar tidak ada dua sumber kebenaran.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_KEY)},s=localStorage.getItem(k),d=s==="dark"||(s!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
