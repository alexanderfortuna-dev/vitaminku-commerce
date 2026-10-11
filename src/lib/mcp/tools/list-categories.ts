import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "list_categories",
  title: "List categories",
  description:
    "List the VitaminKu catalog categories with their subcategories and product counts, for use as filters in search_products.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const supabase = supabaseAnon();
    const counts = new Map<string, Map<string, number>>();
    const pageSize = 1000;

    for (let offset = 0; offset < 6000; offset += pageSize) {
      const { data, error } = await supabase
        .from("products")
        .select("category,subcategory")
        .eq("is_active", true).eq("is_blocked", false)
        .order("category")
        .range(offset, offset + pageSize - 1);
      if (error) return { content: [{ type: "text" as const, text: error.message }], isError: true };

      for (const row of (data ?? []) as Array<{ category: string; subcategory: string }>) {
        const category = row.category?.trim();
        if (!category) continue;
        const subs = counts.get(category) ?? new Map<string, number>();
        const sub = row.subcategory?.trim() || "Lain-lain";
        subs.set(sub, (subs.get(sub) ?? 0) + 1);
        counts.set(category, subs);
      }
      if (!data || data.length < pageSize) break;
    }

    const categories = Array.from(counts.entries())
      .map(([category, subs]) => ({
        category,
        product_count: Array.from(subs.values()).reduce((a, b) => a + b, 0),
        subcategories: Array.from(subs.entries())
          .map(([subcategory, product_count]) => ({ subcategory, product_count }))
          .sort((a, b) => a.subcategory.localeCompare(b.subcategory, "id")),
      }))
      .sort((a, b) => a.category.localeCompare(b.category, "id"));

    return {
      content: [
        {
          type: "text" as const,
          text: categories
            .map(
              (c) =>
                `${c.category} (${c.product_count}): ${c.subcategories
                  .map((s) => `${s.subcategory} (${s.product_count})`)
                  .join(", ")}`,
            )
            .join("\n"),
        },
      ],
      structuredContent: { categories },
    };
  },
});
