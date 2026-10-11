import { afterEach, describe, expect, it } from "vitest";
import { handleVitaChat } from "../vita-chat.server";

describe("Vita tanpa AI_API_KEY", () => {
  const saved = process.env["AI_API_KEY"];
  afterEach(() => {
    if (saved === undefined) delete process.env["AI_API_KEY"];
    else process.env["AI_API_KEY"] = saved;
  });

  it("menjawab sopan 'tidak tersedia' tanpa memanggil database atau penyedia AI", async () => {
    delete process.env["AI_API_KEY"];
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
