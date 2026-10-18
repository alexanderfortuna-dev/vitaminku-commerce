import { describe, expect, it } from "vitest";
import { askFinder, getFinderSessionId, parseFinderResponse, resolveFinderUrl } from "../vitamin-finder-client";

describe("vitamin-finder-client", () => {
  it("resolveFinderUrl: env eksplisit, default dari URL Supabase, atau null", () => {
    expect(resolveFinderUrl({ finderUrl: "https://x/f", supabaseUrl: "https://s.supabase.co" })).toBe("https://x/f");
    expect(resolveFinderUrl({ supabaseUrl: "https://s.supabase.co/" })).toBe("https://s.supabase.co/functions/v1/vitamin-finder");
    expect(resolveFinderUrl({})).toBeNull();
  });
  it("session id acak per tab disimpan di sessionStorage", () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    const a = getFinderSessionId(st);
    expect(a).toMatch(/^[a-f0-9]{24}$/);
    expect(getFinderSessionId(st)).toBe(a);
  });
  it("parse: maks 3 kartu, harga dari fungsi, produk tak valid dibuang", () => {
    const p = (id: string, price: number) => ({ id, name: id, brand: "B", price, size: null, image: null, slug: id });
    const r = parseFinderResponse({
      status: "ok",
      needs_human: false,
      result: { reply_text: "Halo", product_ids: [], products: [p("a", 125000), p("b", 0), p("c", 1), p("d", 2), p("e", 3)] },
    });
    expect(r.products.map((x) => x.id)).toEqual(["a", "c", "d"]);
    expect(r.products[0]?.price).toBe(125000);
    expect(r.needsHuman).toBe(false);
  });
  it("askFinder: kirim apikey + history maks 10; error/timeout/respons rusak -> fallback WhatsApp", async () => {
    let seen: { headers: Record<string, string>; body: { history: unknown[] } } | undefined;
    const ok = (async (_u: string, init: RequestInit) => {
      seen = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return { json: async () => ({ status: "ok", needs_human: true, result: { reply_text: "ok", product_ids: [] } }) };
    }) as unknown as typeof fetch;
    const history = Array.from({ length: 14 }, () => ({ role: "user" as const, content: "x" }));
    const r = await askFinder({ url: "u", apiKey: "pk", sessionId: "s", message: "m", history, fetchFn: ok });
    expect(seen?.headers["apikey"]).toBe("pk");
    expect(seen?.body.history).toHaveLength(10);
    expect(r.needsHuman).toBe(true);
    const boom = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    const f1 = await askFinder({ url: "u", apiKey: "pk", sessionId: "s", message: "m", history: [], fetchFn: boom });
    expect(f1.failed && f1.needsHuman).toBe(true);
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new Error("abort"))))) as unknown as typeof fetch;
    const f2 = await askFinder({ url: "u", apiKey: "pk", sessionId: "s", message: "m", history: [], fetchFn: hang, timeoutMs: 20 });
    expect(f2.failed && f2.needsHuman).toBe(true);
    const bad = (async () => ({ json: async () => ({ nope: 1 }) })) as unknown as typeof fetch;
    expect((await askFinder({ url: "u", apiKey: "pk", sessionId: "s", message: "m", history: [], fetchFn: bad })).failed).toBe(true);
  });
});
