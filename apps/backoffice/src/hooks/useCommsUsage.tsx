import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface CommsUsageRow {
  tenant_id: string;
  tenant_name: string;
  country: string | null;
  balance: number | null;
  free_monthly_allocation: number | null;
  last_reset_at: string | null;
  last_purchase_at: string | null;
  last_purchase_amount: number | null;
  last_purchase_currency: string | null;
  sms_sent_30d: number;
  email_sent_30d: number;
  reminders_sent_30d: number;
  birthday_sent_30d: number;
  delivered_30d: number;
  failed_30d: number;
}

export function useCommsUsage() {
  return useQuery({
    queryKey: ["backoffice-comms-usage"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_backoffice_comms_usage" as never);
      if (error) throw error;
      return (data || []) as unknown as CommsUsageRow[];
    },
  });
}

export interface TenantMessageLogRow {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  content: string | null;
  status: string;
  credits_used: number;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export function useTenantMessageLog(tenantId: string | null) {
  return useQuery({
    queryKey: ["backoffice-tenant-message-log", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tenant_message_log" as never, {
        p_tenant_id: tenantId,
        p_limit: 200,
      } as never);
      if (error) throw error;
      return (data || []) as unknown as TenantMessageLogRow[];
    },
  });
}
