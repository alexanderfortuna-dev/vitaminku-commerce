import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

function runtimeEnv(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}

function configuredEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = runtimeEnv(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

function supabaseProjectUrl(): string {
  const url = configuredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  if (!url) throw new Error("SUPABASE_URL (or VITE_SUPABASE_URL) is required");
  return url;
}

function supabasePublishableKey(): string {
  const direct = configuredEnv(["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
  if (direct) return direct;
  const keyset = runtimeEnv("SUPABASE_PUBLISHABLE_KEYS");
  if (keyset) {
    try {
      const parsed: unknown = JSON.parse(keyset);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = parsed as Record<string, unknown>;
        const key = [keys["default"], ...Object.values(keys)]
          .find((v): v is string => typeof v === "string" && v.trim().startsWith("sb_publishable_"))
          ?.trim();
        if (key) return key;
      }
    } catch {
      // Malformed dictionary; fall through to the legacy names.
    }
  }
  const legacy = configuredEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"]);
  if (legacy) return legacy;
  throw new Error("SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required");
}

/** No caller identity — RLS runs as `anon`, i.e. the public catalog only. */
export function supabaseAnon() {
  return createClient<Database>(supabaseProjectUrl(), supabasePublishableKey(), {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const PRODUCT_COLUMNS =
  "id,sku,name,brand,category,subcategory,size,pack_count,servings,dose,flavor,price,compare_at_price,stock,image_url,description,bpom_number,slug";

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  size: string | null;
  pack_count: string | null;
  servings: string | null;
  dose: string | null;
  flavor: string | null;
  price: number | null;
  compare_at_price: number | null;
  stock: number | null;
  image_url: string | null;
  description: string | null;
  bpom_number: string | null;
  slug: string | null;
}

/** JSON-safe projection for MCP structuredContent. */
export const toProductJson = (p: ProductRow) => ({
  sku: p.sku,
  name: p.name,
  brand: p.brand,
  category: p.category,
  subcategory: p.subcategory,
  size: p.size,
  pack_count: p.pack_count,
  servings: p.servings,
  dose: p.dose,
  flavor: p.flavor,
  price_idr: p.price,
  compare_at_price_idr: p.compare_at_price,
  in_stock: (p.stock ?? 0) > 0,
  bpom_number: p.bpom_number,
  slug: p.slug,
  product_url: p.slug && process.env["PUBLIC_SITE_URL"] ? `${process.env["PUBLIC_SITE_URL"].replace(/\/$/, "")}/produk/${p.slug}` : null,
});

/** Strips characters that would break a Postgres text-search / ILIKE pattern. */
export function sanitizeSearchQuery(input: string): string {
  return input
    .replace(/[%_&|!():*'"\\<>=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
