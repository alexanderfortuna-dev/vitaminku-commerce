// Single registration point for the app service worker (/sw.js).
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function onInstallChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const canPromptInstall = () => deferred !== null;

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  notify();
  return outcome === "accepted";
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

export function swAllowed(): boolean {
  const h = window.location.hostname;
  let inIframe = true;
  try { inIframe = window.self !== window.top; } catch { /* cross-origin => iframe */ }
  if (!import.meta.env.PROD || inIframe) return false;
  if (h === "localhost" || h === "127.0.0.1") return false;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return false;
  if (/(^|\.)lovableproject(-dev)?\.com$/.test(h) || /(^|\.)beta\.lovable\.dev$/.test(h)) return false;
  if (new URLSearchParams(window.location.search).has("sw") &&
      new URLSearchParams(window.location.search).get("sw") === "off") return false;
  return true;
}

let started = false;
export function initPwa() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
  if (!("serviceWorker" in navigator)) return;
  if (swAllowed()) {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) =>
      regs.forEach((r) => { if (r.active?.scriptURL.endsWith("/sw.js")) void r.unregister(); }),
    ).catch(() => {});
  }
}

const KEY = "vk-install-dismissed";
export const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
export function isDismissed(now = Date.now()) {
  const v = Number(localStorage.getItem(KEY) ?? 0);
  return v > 0 && now - v < DISMISS_MS;
}
export function dismiss() { localStorage.setItem(KEY, String(Date.now())); }
export function clearDismiss() { localStorage.removeItem(KEY); }

export const OPEN_EVENT = "vk-open-install";
export function openInstall() { clearDismiss(); window.dispatchEvent(new Event(OPEN_EVENT)); }
