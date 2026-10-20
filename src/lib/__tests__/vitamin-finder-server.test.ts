import { afterEach, describe, expect, it } from "vitest";
import { handleVitaminFinder } from "../vitamin-finder.server";

const post = (body: unknown) =>
  new Request("http://localhost/api/vitamin-finder", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

describe("/api/vitamin-finder (server Vercel)", () => {
  const saved = { url: process.env["SUPABASE_URL"], key: process.env["SUPABASE_PUBLISHABLE_KEY"] };
  afterEach(() => {
    if (saved.url === undefined) delete process.env["SUPABASE_URL"];
    else process.env["SUPABASE_URL"] = saved.url;
    if (saved.key === undefined) delete process.env["SUPABASE_PUBLISHABLE_KEY"];
    else process.env["SUPABASE_PUBLISHABLE_KEY"] = saved.key;
  });

  it("JSON rusak -> 400 invalid_input", async () => {
    const res = await handleVitaminFinder(post("{rusak"));
    expect(res.status).toBe(400);
    expect((await res.json()).status).toBe("invalid_input");
  });

  it("tanpa konfigurasi database -> fallback aman, tidak melempar", async () => {
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_PUBLISHABLE_KEY"];
    const res = await handleVitaminFinder(post({ session_id: "uji", message: "cari whey", history: [] }));
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.needs_human).toBe(true);
  });
});
