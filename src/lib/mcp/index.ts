import { defineMcp } from "@lovable.dev/mcp-js";
import searchProductsTool from "./tools/search-products";
import getProductTool from "./tools/get-product";
import listCategoriesTool from "./tools/list-categories";
import listBrandsTool from "./tools/list-brands";

export default defineMcp({
  name: "vitaminku-commerce",
  title: "VitaminKu Commerce",
  version: "0.1.0",
  instructions:
    "Public catalog tools for VitaminKu, an Indonesian vitamin and sports-nutrition store. Use `search_products` to find items, `get_product` for full details of one product, and `list_categories` / `list_brands` to discover valid filter values. Prices are shown only when published; when a price is missing, say it is not published yet instead of guessing.",
  tools: [searchProductsTool, getProductTool, listCategoriesTool, listBrandsTool],
});
