// Data pelanggan untuk prefill checkout. Pembacaan OPSIONAL: tamu (belum login) mendapat null, tidak pernah galat.
// RLS "Customer reads own record" membatasi baca ke baris milik sendiri; kita juga menyaring eksplisit user_id
// agar owner (yang boleh membaca semua) tidak mendapat baris orang lain.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface MyCustomer {
  name: string;
  whatsapp: string;
  address: string | null;
}

export const getMyCustomer = createServerFn({ method: "GET" }).handler(async (): Promise<MyCustomer | null> => {
  try {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const auth = getRequest()?.headers.get("authorization");
    if (!url || !key || !auth?.startsWith("Bearer ")) return null;
    const token = auth.slice(7);
    if (token.split(".").length !== 3) return null;
    const supabase = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: claims } = await supabase.auth.getClaims(token);
    const uid = claims?.claims?.sub;
    if (!uid) return null;
    const { data } = await supabase
      .from("customers")
      .select("name,whatsapp_normalized,default_address")
      .eq("user_id", uid)
      .maybeSingle();
    if (!data) return null;
    return { name: data.name, whatsapp: data.whatsapp_normalized, address: data.default_address };
  } catch {
    return null;
  }
});
