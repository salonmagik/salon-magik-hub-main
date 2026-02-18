import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type PlanChangeNotification = {
  notification_id: string;
  batch_id: string;
  plan_id: string;
  reason: string;
  rollout_at: string | null;
  rolled_out_at: string | null;
  created_at: string;
  change_summary_json: Record<string, unknown> | null;
  seen_at: string | null;
  cta_opened_at: string | null;
  dismissed_at: string | null;
};

export function usePlanChangeNotifications() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["plan-change-notifications", currentTenant?.id],
    enabled: Boolean(currentTenant?.id),
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_tenant_plan_change_notifications", {
        p_tenant_id: currentTenant?.id,
        p_limit: 20,
      });
      if (error) throw error;
      return (data || []) as PlanChangeNotification[];
    },
  });

  const markMutation = useMutation({
    mutationFn: async ({ notificationId, action }: { notificationId: string; action: "seen" | "opened" | "dismissed" }) => {
      const { error } = await (supabase.rpc as any)("mark_plan_change_notification_seen", {
        p_notification_id: notificationId,
        p_action: action,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan-change-notifications", currentTenant?.id] });
    },
  });

  const unseen = (query.data || []).filter((item) => !item.dismissed_at && !item.seen_at);
  const latestUnseen = unseen[0] || null;

  return {
    ...query,
    notifications: query.data || [],
    latestUnseen,
    markSeen: (notificationId: string) =>
      markMutation.mutateAsync({ notificationId, action: "seen" }),
    markOpened: (notificationId: string) =>
      markMutation.mutateAsync({ notificationId, action: "opened" }),
    dismiss: (notificationId: string) =>
      markMutation.mutateAsync({ notificationId, action: "dismissed" }),
  };
}
