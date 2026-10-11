import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  PRODUCT_COLUMNS,
  sanitizeSearchQuery,
  supabaseAnon,
  toProductJson,
  type ProductRow,
} from "../supabase";

export default defineTool({
  name: "search_products",
  title: "Search products",
  description:
    "Search the public VitaminKu catalog by keyword, brand, category, or subcategory. Returns up to 24 matching products per page.",
  inputSchema: {
    query: z.string().trim().default("").describe("Keyword matched against product name and brand."),
    brand: z.string().trim().nullish().describe("Exact brand name filter."),
    category: z.string().trim().nullish().describe("Exact category filter."),
    subcategory: z.string().trim().nullish().describe("Exact subcategory filter."),
    in_stock_only: z.boolean().default(false).describe("Only return products with stock above zero."),
    limit: z.number().int().min(1).max(24).default(12).describe("Maximum products to return."),
    offset: z.number().int().min(0).max(5000).default(0).describe("Result offset for paging."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input) => {
    const supabase = supabaseAnon();
    const search = sanitizeSearchQuery(input.query ?? "");

    let query = supabase
      .from("products")
      .select(PRODUCT_COLUMNS, { count: "exact" })
      .eq("is_active", true).eq("is_blocked", false);

    if (input.brand) query = query.eq("brand", input.brand);
    if (input.category) query = query.eq("category", input.category);
    if (input.subcategory) query = query.eq("subcategory", input.subcategory);
    if (input.in_stock_only) query = query.gt("stock", 0);
    if (search) {
      const like = `%${search}%`;
      query = query.or(
        `name.ilike.${like},brand.ilike.${like},category.ilike.${like},subcategory.ilike.${like}`,
      );
    }

    const {
      data,
      count,
      error,
    } = await query.order("name", { ascending: true }).range(input.offset, input.offset + input.limit - 1);

    if (error) return { content: [{ type: "text" as const, text: error.message }], isError: true };

    const products = ((data ?? []) as unknown as ProductRow[]).map(toProductJson);
    const total = count ?? products.length;
    return {
      content: [
        {
          type: "text" as const,
          text:
            products.length === 0
              ? "No matching products found."
              : `${products.length} of ${total} matching products:\n` +
                products
                  .map(
                    (p) =>
                      `- ${p.name} (${p.brand}) · ${p.category}/${p.subcategory} · ${
                        p.price_idr === null ? "price not published yet" : `IDR ${p.price_idr}`
                      } · ${p.in_stock ? "in stock" : "out of stock"} · slug: ${p.slug ?? "n/a"}`,
                  )
                  .join("\n"),
        },
      ],
      structuredContent: { total, offset: input.offset, products },
    };
  },
});
