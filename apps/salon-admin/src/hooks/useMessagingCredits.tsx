import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export interface CommunicationCredits {
  id: string;
  tenant_id: string;
  balance: number;
  free_monthly_allocation: number;
  last_reset_at: string;
  created_at: string;
  updated_at: string;
}

export interface MessageLog {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  template_type: string | null;
  channel: "email" | "sms";
  recipient: string;
  subject: string | null;
  status: "pending" | "sent" | "delivered" | "failed";
  credits_used: number;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export function useMessagingCredits() {
  const { currentTenant } = useAuth();
  const [credits, setCredits] = useState<CommunicationCredits | null>(null);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCredits = useCallback(async () => {
    if (!currentTenant?.id) {
      setCredits(null);
      setMessageLogs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch credits
      const { data: creditsData, error: creditsError } = await supabase
        .from("communication_credits")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();

      if (creditsError) throw creditsError;

      setCredits(creditsData as CommunicationCredits | null);

      // Fetch message logs
      const { data: logsData, error: logsError } = await supabase
        .from("message_logs")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (logsError) throw logsError;

      setMessageLogs((logsData as MessageLog[]) || []);
    } catch (err) {
      console.error("Error fetching messaging credits:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  // Statistics
  const totalSent = messageLogs.filter((m) => m.status === "sent" || m.status === "delivered").length;
  const totalFailed = messageLogs.filter((m) => m.status === "failed").length;
  const emailsSent = messageLogs.filter((m) => m.channel === "email" && (m.status === "sent" || m.status === "delivered")).length;
  const smsSent = messageLogs.filter((m) => m.channel === "sms" && (m.status === "sent" || m.status === "delivered")).length;

  return {
    credits,
    messageLogs,
    stats: {
      totalSent,
      totalFailed,
      emailsSent,
      smsSent,
      creditsRemaining: credits?.balance || 0,
      freeAllocation: credits?.free_monthly_allocation || 30,
    },
    isLoading,
    error,
    refetch: fetchCredits,
  };
}
