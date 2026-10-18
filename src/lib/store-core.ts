// Pure, browser-safe helpers for branches.
import { OFFICIAL_WHATSAPP_MAIN } from "./official-contacts";

export const DEFAULT_WHATSAPP = OFFICIAL_WHATSAPP_MAIN;

/** "0813-3995-0000" / "+62 813..." / "813..." -> "62813..." ; null when invalid. */
export function normalizeBranchWhatsapp(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return /^628[0-9]{7,12}$/.test(d) ? d : null;
}

/** The WhatsApp number an order is routed to: chosen active branch, else the main number. */
export function pickBranchNumber(
  branches: Array<{ id: string; whatsapp: string; is_active: boolean }>,
  branchId: string | null | undefined,
): { id: string | null; whatsapp: string } {
  const b = branchId ? branches.find((x) => x.id === branchId && x.is_active) : undefined;
  return b ? { id: b.id, whatsapp: b.whatsapp } : { id: null, whatsapp: DEFAULT_WHATSAPP };
}
