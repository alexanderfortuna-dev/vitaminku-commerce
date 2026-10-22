import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, currentTheme, readThemeChoice, resolveTheme, writeThemeChoice, type Theme } from "@/lib/theme";

/** Tombol tema (≥44px). Pilihan disimpan di perangkat; "ikuti sistem" berlaku sampai pelanggan memilih sendiri. */
export function ThemeToggle({ withLabel = false, className = "" }: { withLabel?: boolean; className?: string }) {
  // Render pertama ikut dokumen (skrip boot sudah memasang kelas .dark) agar tidak ada perbedaan hidrasi.
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(currentTheme());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (readThemeChoice() !== "system") return;
      const t = resolveTheme(null, mq.matches);
      applyTheme(t);
      setTheme(t);
    };
    mq.addEventListener("change", onSystem);
    return () => mq.removeEventListener("change", onSystem);
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = theme === "dark" ? "Mode terang" : "Mode gelap";
  return (
    <button
      type="button"
      onClick={() => {
        writeThemeChoice(next);
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={`Ganti ke ${label.toLowerCase()}`}
      aria-pressed={theme === "dark"}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-secondary text-navy ${withLabel ? "px-4 text-sm font-bold" : ""} ${className}`}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      {withLabel && <span>{label}</span>}
    </button>
  );
}
