// Konfigurasi build milik VitaminKu sendiri (tanpa paket Lovable).
// Setara dengan konfigurasi bawaan lama untuk build di luar sandbox Lovable:
// tailwind, path tsconfig, TanStack Start (entry server = src/server.ts), nitro saat build,
// React, injeksi VITE_* untuk semua lingkungan build, alias "@", dan dedupe React.
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );
  return {
    define,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    server: { host: "::", port: 8080 },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        // Bundel server memakai src/server.ts (pembungkus galat SSR).
        server: { entry: "server" },
      }),
      // Preset diambil dari NITRO_PRESET (build:vercel = vercel); cadangan sama seperti sebelumnya.
      ...(command === "build" ? [nitro({ defaultPreset: "cloudflare-module" })] : []),
      viteReact(),
    ],
  };
});
