import { useQuery } from "@tanstack/react-query";
import { getRunningPromos } from "@/lib/promo.functions";

/** Running promos from the database (one shared, cached request). */
export function useRunningPromos() {
  return useQuery({ queryKey: ["running-promos"], queryFn: () => getRunningPromos(), staleTime: 5 * 60_000 }).data ?? [];
}
