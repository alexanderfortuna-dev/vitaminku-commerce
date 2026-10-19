import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyAdminRole } from "@/lib/admin.functions";
import { ROLE_LABEL, type AdminRole } from "@/lib/admin-roles";

export function AdminPanelLink() {
  const fetchRole = useServerFn(getMyAdminRole);
  const { data } = useQuery({
    queryKey: ["admin-role-badge"],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return { role: null as AdminRole | null };
      try {
        const result = await fetchRole();
        return { role: (result.role ?? null) as AdminRole | null };
      } catch {
        return { role: null as AdminRole | null };
      }
    },
  });

  if (!data?.role) return null;

  return (
    <Link to="/admin" className="mx-4 mb-2 flex items-center gap-2 p-3 card-surface">
      <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">Seller Center</span>
      <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[data.role]}</span>
    </Link>
  );
}
