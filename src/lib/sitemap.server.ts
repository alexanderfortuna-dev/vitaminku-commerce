// Handler server untuk /sitemap.xml dan /robots.txt. Katalog dibaca sebagai anon, jadi RLS toko
// (aktif + tidak diblokir) tetap berlaku; sitemap menyaring ulang lewat isSitemapProduct.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildRobotsTxt, buildSitemapEntries, buildSitemapXml, cleanOrigin, type SitemapProduct } from "./seo";

/** SITE_URL (env server) bila diisi; kalau tidak, origin dari permintaan (header proxy Vercel dipercaya). */
export function siteOrigin(request: Request): string {
  const fromEnv = cleanOrigin(process.env["SITE_URL"] ?? process.env["VITE_SITE_URL"]);
  if (fromEnv) return fromEnv;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(request.url).protocol.replace(":", "");
  return cleanOrigin(`${proto}://${host}`);
}

const CACHE = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

async function buildResponse(request: Request): Promise<Response> {
  const supabase = createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const products: Array<SitemapProduct & { brand: string }> = [];
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("slug,brand,price,is_active,is_blocked,updated_at")
      .eq("is_active", true)
      .eq("is_blocked", false)
      .gt("price", 0)
      .order("id")
      .range(offset, offset + 999);
    if (error) return new Response("Sitemap belum tersedia.", { status: 503, headers: { "cache-control": "no-store" } });
    products.push(...((data ?? []) as unknown as Array<SitemapProduct & { brand: string }>));
    if (!data || data.length < 1000) break;
  }
  const entries = buildSitemapEntries({
    origin: siteOrigin(request),
    products,
    brands: products.filter((p) => p.slug).map((p) => p.brand),
  });
  return new Response(buildSitemapXml(entries), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": CACHE },
  });
}

export async function handleSitemap(request: Request): Promise<Response> {
  try {
    return await buildResponse(request);
  } catch {
    return new Response("Sitemap belum tersedia.", { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export function handleRobots(request: Request): Response {
  return new Response(buildRobotsTxt(siteOrigin(request)), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": CACHE },
  });
}
