import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "list_brands",
  title: "List brands",
  description:
    "List the brands available in the public VitaminKu catalog with product counts, for use as the `brand` filter in search_products.",
  inputSchema: {
    starts_with: z
      .string()
      .trim()
      .max(3)
      .nullish()
      .describe("Optional prefix filter, e.g. \"A\" for brands starting with A."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ starts_with }) => {
    const supabase = supabaseAnon();
    const counts = new Map<string, number>();
    const pageSize = 1000;

    for (let offset = 0; offset < 6000; offset += pageSize) {
      const { data, error } = await supabase
        .from("products")
        .select("brand")
        .eq("is_active", true).eq("is_blocked", false)
        .order("brand")
        .range(offset, offset + pageSize - 1);
      if (error) return { content: [{ type: "text" as const, text: error.message }], isError: true };

      for (const row of (data ?? []) as Array<{ brand: string }>) {
        const brand = row.brand?.trim();
        if (!brand) continue;
        counts.set(brand, (counts.get(brand) ?? 0) + 1);
      }
      if (!data || data.length < pageSize) break;
    }

    const prefix = starts_with?.toLowerCase() ?? "";
    const brands = Array.from(counts.entries())
      .filter(([brand]) => (prefix ? brand.toLowerCase().startsWith(prefix) : true))
      .map(([brand, product_count]) => ({ brand, product_count }))
      .sort((a, b) => a.brand.localeCompare(b.brand, "id"));

    return {
      content: [
        {
          type: "text" as const,
          text:
            brands.length === 0
              ? "No brands matched."
              : brands.map((b) => `${b.brand} (${b.product_count})`).join("\n"),
        },
      ],
      structuredContent: { total: brands.length, brands },
    };
  },
});
