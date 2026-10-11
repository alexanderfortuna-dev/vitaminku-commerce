import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { PRODUCT_COLUMNS, supabaseAnon, toProductJson, type ProductRow } from "../supabase";

export default defineTool({
  name: "get_product",
  title: "Get product",
  description:
    "Get full public details for one VitaminKu product by its slug or SKU, including description, spec fields, price availability, and BPOM number.",
  inputSchema: {
    slug: z.string().trim().nullish().describe("Product slug, as returned by search_products."),
    sku: z.string().trim().nullish().describe("Product SKU, used when no slug is given."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ slug, sku }) => {
    if (!slug && !sku) throw new ToolError("Provide either a slug or a sku.");
    const supabase = supabaseAnon();
    let query = supabase.from("products").select(PRODUCT_COLUMNS).eq("is_active", true).eq("is_blocked", false).limit(1);
    query = slug ? query.eq("slug", slug) : query.eq("sku", sku!);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text" as const, text: error.message }], isError: true };

    const row = (data?.[0] as unknown as ProductRow | undefined) ?? null;
    if (!row) throw new ToolError(`No active product found for ${slug ? `slug "${slug}"` : `sku "${sku}"`}.`);

    const product = toProductJson(row);
    const lines = [
      `${product.name} — ${product.brand}`,
      `Category: ${product.category} / ${product.subcategory}`,
      `Price: ${product.price_idr === null ? "not published yet" : `IDR ${product.price_idr}`}`,
      `Stock: ${product.in_stock ? "in stock" : "out of stock"}`,
      product.size ? `Size: ${product.size}` : null,
      product.servings ? `Servings: ${product.servings}` : null,
      product.dose ? `Dose: ${product.dose}` : null,
      product.flavor ? `Flavor: ${product.flavor}` : null,
      product.bpom_number ? `BPOM: ${product.bpom_number}` : null,
      product.product_url ? `URL: ${product.product_url}` : null,
      row.description ? `\n${row.description}` : null,
    ].filter((l): l is string => Boolean(l));

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      structuredContent: { product: { ...product, description: row.description } },
    };
  },
});
