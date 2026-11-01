import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests do not need SSR builds, route generation or deployment plugins.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
