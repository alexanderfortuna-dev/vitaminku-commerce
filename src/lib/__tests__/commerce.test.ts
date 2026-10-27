import { describe, expect, it } from "vitest";
import { dedupeProducts, sanitizeSearchQuery, shopifyImageUrl } from "../shopify";
import { CATEGORIES, GOALS } from "../catalog";
import { brandInitials, hasPrice, productSlug, type DbProduct } from "../catalog-db";
import { sanitizeSearchQuery as sanitizeDbSearch } from "../catalog.functions";
import { normalizeOrderStatus } from "../order-status";
import { enabledDeliveryProviders } from "../delivery-providers";
import type { ShopifyProduct } from "../shopify";

const product = (id: string, handle: string) =>
  ({ node: { id, handle } }) as unknown as ShopifyProduct;

const dbProduct = (over: Partial<DbProduct> = {}) =>
  ({
    id: "p1",
    sku: "SKU1",
    name: "Whey Isolate 2 lbs",
    brand: "Optimum Nutrition",
    category: "Sport Nutrition",
    subcategory: "Protein",
    price: null,
    compare_at_price: null,
    stock: 0,
    image_url: null,
    slug: "whey-isolate-2-lbs",
    ...over,
  }) as unknown as DbProduct;

describe("search hardening", () => {
  it("strips Shopify search operators from customer text", () => {
    expect(sanitizeSearchQuery('vitamin c: "best" OR *')).toBe("vitamin c best");
  });
  it("returns empty string for operator-only input", () => {
    expect(sanitizeSearchQuery("*:()")).toBe("");
  });
  it("strips text-search wildcards from database queries", () => {
    expect(sanitizeDbSearch("whey% _iso (x)")).toBe("whey iso x");
  });
});

describe("pagination safety", () => {
  it("removes duplicate products across cursor pages", () => {
    const list = [product("1", "a"), product("1", "a"), product("2", "b")];
    expect(dedupeProducts(list)).toHaveLength(2);
  });
});

describe("mobile image sizing", () => {
  it("requests a width from the Shopify CDN", () => {
    expect(shopifyImageUrl("https://cdn.shopify.com/x.jpg", 400)).toContain("width=400");
  });
});

describe("database catalog products", () => {
  it("never treats a missing price as buyable", () => {
    expect(hasPrice(dbProduct())).toBe(false);
    expect(hasPrice(dbProduct({ price: 250000 }))).toBe(true);
  });
  it("falls back to the row id when a slug is missing", () => {
    expect(productSlug(dbProduct())).toBe("whey-isolate-2-lbs");
    expect(productSlug(dbProduct({ slug: null }))).toBe("p1");
  });
  it("derives brand initials for the image placeholder", () => {
    expect(brandInitials(dbProduct())).toBe("ON");
  });
});

describe("catalog mapping", () => {
  it("maps every category and goal to real database values", () => {
    for (const category of CATEGORIES) {
      expect(category.category.length).toBeGreaterThan(0);
      expect(category.subcategories.length).toBeGreaterThan(0);
    }
    for (const goal of GOALS) {
      expect(goal.subcategories.length).toBeGreaterThan(0);
    }
  });
});

describe("order status normalization", () => {
  it("never reports a paid order as delivered", () => {
    expect(
      normalizeOrderStatus({ financialStatus: "PAID", fulfillmentStatus: "UNFULFILLED" }),
    ).toBe("PAID");
  });
  it("treats authorized payment as still pending", () => {
    expect(normalizeOrderStatus({ financialStatus: "AUTHORIZED" })).toBe("PENDING_PAYMENT");
  });
  it("does not upgrade fulfilled to delivered", () => {
    expect(normalizeOrderStatus({ financialStatus: "PAID", fulfillmentStatus: "FULFILLED" })).toBe(
      "READY_FOR_DELIVERY",
    );
  });
  it("uses delivered only with real fulfillment evidence", () => {
    expect(
      normalizeOrderStatus({
        financialStatus: "PAID",
        fulfillmentStatus: "FULFILLED",
        fulfillmentDisplayStatus: "DELIVERED",
      }),
    ).toBe("DELIVERED");
  });
  it("keeps partial refunds distinct", () => {
    expect(normalizeOrderStatus({ financialStatus: "PARTIALLY_REFUNDED" })).toBe(
      "PARTIALLY_REFUNDED",
    );
  });
  it("maps unknown values to UNKNOWN", () => {
    expect(normalizeOrderStatus({ financialStatus: "SOMETHING_NEW" })).toBe("UNKNOWN");
  });
});

describe("delivery providers", () => {
  it("tanpa kunci hanya ongkir via WhatsApp; kurir paket butuh kunci Biteship; instan butuh kunci DAN saklar", () => {
    expect(enabledDeliveryProviders({})).toEqual(["manual_whatsapp"]);
    expect(enabledDeliveryProviders({ BITESHIP_API_KEY: "  " , INSTANT_DELIVERY_ENABLED: "true" })).toEqual(["manual_whatsapp"]);
    expect(enabledDeliveryProviders({ BITESHIP_API_KEY: "k" })).toEqual(["manual_whatsapp", "biteship_regular"]);
    expect(enabledDeliveryProviders({ BITESHIP_API_KEY: "k", INSTANT_DELIVERY_ENABLED: "TRUE" })).toEqual(["manual_whatsapp", "biteship_regular", "biteship_instant"]);
  });
});

