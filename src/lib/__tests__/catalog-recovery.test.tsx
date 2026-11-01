import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ComponentType, type ReactNode } from "react";

const state = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isPending: false,
    isError: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => state.query,
  useInfiniteQuery: () => state.query,
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/ProductRail", () => ({
  ProductGrid: ({ products }: { products: Array<{ name: string }> }) => (
    <div>{products.map((p) => p.name).join(",")}</div>
  ),
}));
import { Route } from "@/routes/cari";
import { Route as BrandsRoute } from "@/routes/merek.index";
import { SearchInput } from "@/components/SearchInput";

const renderSearch = () =>
  renderToStaticMarkup(createElement(Route.options.component as ComponentType));

describe("catalog recovery", () => {
  beforeEach(() => {
    Object.assign(state.query, {
      data: undefined,
      isPending: false,
      isError: false,
      isFetching: false,
    });
    vi.spyOn(Route, "useSearch").mockReturnValue({ q: "vitamin" });
  });
  it("shows retry instead of claiming that a failed search has no matches", () => {
    state.query.isError = true;
    const html = renderSearch();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Coba lagi");
    expect(html).not.toContain("Produk tidak ditemukan");
    expect(html).not.toContain("0 hasil untuk");
  });
  it("still shows an honest empty result after a successful query", () => {
    state.query.data = { pages: [{ products: [], total: 0 }] };
    expect(renderSearch()).toContain("Produk tidak ditemukan");
    expect(renderSearch()).not.toContain('role="alert"');
  });
  it("retains loaded products after a subsequent request fails", () => {
    state.query.isError = true;
    state.query.data = { pages: [{ products: [{ id: "1", name: "Produk tersimpan" }], total: 1 }] };
    expect(renderSearch()).toContain("Produk tersimpan");
    expect(renderSearch()).not.toContain("Produk tidak ditemukan");
  });
  it("does not claim zero brands when loading brands fails", () => {
    state.query.isError = true;
    const html = renderToStaticMarkup(
      createElement(BrandsRoute.options.component as ComponentType),
    );
    expect(html).toContain("Coba lagi");
    expect(html).not.toContain("0 merek dalam katalog");
  });
  it("gives the header and page search inputs separate labels", () => {
    const html = renderToStaticMarkup(
      <>
        <SearchInput />
        <SearchInput initialValue="vitamin" />
      </>,
    );
    const ids = [...html.matchAll(/<input[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`for="${id}"`);
  });
  it("trims whitespace-only URL searches so they cannot remain loading forever", () => {
    const validate = Route.options.validateSearch as (value: Record<string, unknown>) => {
      q: string;
    };
    expect(validate({ q: "   " })).toEqual({ q: "" });
    expect(validate({ q: " vitamin " })).toEqual({ q: "vitamin" });
  });
});
