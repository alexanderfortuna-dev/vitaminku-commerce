// Pelapor galat sisi browser. Ringan: batas jumlah per halaman, tanpa pustaka pihak ketiga.
import { shouldIgnoreClientError } from "./error-payload";

const MAX_PER_PAGE = 5;
const sent = new Set<string>();
let installed = false;

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message || error.name, ...(error.stack ? { stack: error.stack } : {}) };
  if (typeof error === "string") return { message: error };
  if (typeof Response !== "undefined" && error instanceof Response) return { message: `Response ${error.status}` };
  try {
    return { message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { message: String(error) };
  }
}

export function reportClientError(error: unknown, kind: "error" | "unhandledrejection" | "boundary" = "error") {
  if (typeof window === "undefined" || sent.size >= MAX_PER_PAGE) return;
  const { message, stack } = describe(error);
  if (shouldIgnoreClientError(message) || sent.has(message)) return;
  sent.add(message);
  try {
    void fetch("/api/public/client-error", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: message.slice(0, 500), stack: stack?.slice(0, 3000), url: window.location.pathname, kind }),
    }).catch(() => undefined);
  } catch {
    /* melaporkan galat tidak boleh menimbulkan galat baru */
  }
}

export function installClientErrorReporting() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  window.addEventListener("error", (e) => reportClientError(e.error ?? e.message, "error"));
  window.addEventListener("unhandledrejection", (e) => reportClientError(e.reason, "unhandledrejection"));
}
