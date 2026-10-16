import { afterEach, describe, expect, it } from "vitest";
import { handleVitaChat } from "../vita-chat.server";

describe("Vita tanpa kunci AI", () => {
  const KEYS = ["AI_API_KEY", "ANTHROPIC_API_KEY"] as const;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("menjawab sopan 'tidak tersedia' tanpa memanggil database atau penyedia AI", async () => {
    for (const k of KEYS) delete process.env[k];
    const res = await handleVitaChat(
      new Request("http://localhost/api/vita-chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "halo" }] }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("tidak tersedia");
  });
});
