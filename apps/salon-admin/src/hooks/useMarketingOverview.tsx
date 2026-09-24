import { useQuery } from "@tanstack/react-query";
import { startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

type DateRange = "today" | "week" | "month";

export interface MarketingOverviewStats {
  individualEmail: number;
  individualSms: number;
  targetedEmail: number;
  targetedSms: number;
  bulkEmail: number;
  bulkSms: number;
}

function getSince(range: DateRange): Date {
  const now = new Date();
  switch (range) {
    case "today":
      return startOfDay(now);
    case "week":
      return startOfWeek(now, { weekStartsOn: 1 });
    case "month":
      return startOfMonth(now);
    default:
      return startOfDay(now);
  }
}

// Classifies each message_logs row by its broadcast_scope: "single" is a
// 1:1 send (Individual), "all_customers" is a full broadcast (Bulk), and
// any other preset (VIP, etc.) is a segment broadcast (Targeted). Rows sent
// before broadcast_scope existed have it null and are excluded from every
// bucket rather than guessed at.
export function useMarketingOverview(dateRange: DateRange) {
  const { currentTenant } = useAuth();

  return useQuery({
    queryKey: ["marketing-overview", currentTenant?.id, dateRange],
    enabled: Boolean(currentTenant?.id),
    queryFn: async (): Promise<MarketingOverviewStats> => {
      const since = getSince(dateRange);
      const { data, error } = await supabase
        .from("message_logs")
        .select("channel, broadcast_scope, status")
        .eq("tenant_id", currentTenant!.id)
        .gte("created_at", since.toISOString())
        .in("status", ["sent", "delivered"]);

      if (error) throw error;

      const rows = (data ?? []) as Array<{ channel: string; broadcast_scope: string | null }>;
      const individual = rows.filter((r) => r.broadcast_scope === "single");
      const bulk = rows.filter((r) => r.broadcast_scope === "all_customers");
      const targeted = rows.filter(
        (r) => r.broadcast_scope && r.broadcast_scope !== "single" && r.broadcast_scope !== "all_customers",
      );

      const countByChannel = (list: typeof rows, channel: string) =>
        list.filter((r) => r.channel === channel).length;

      return {
        individualEmail: countByChannel(individual, "email"),
        individualSms: countByChannel(individual, "sms"),
        targetedEmail: countByChannel(targeted, "email"),
        targetedSms: countByChannel(targeted, "sms"),
        bulkEmail: countByChannel(bulk, "email"),
        bulkSms: countByChannel(bulk, "sms"),
      };
    },
    staleTime: 30_000,
  });
}
