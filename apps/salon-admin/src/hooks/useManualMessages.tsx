import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { Tables } from "@supabase-client";
import { toast } from "@ui/ui/use-toast";

type ManualMessage = Tables<"manual_messages">;
type Customer = Tables<"customers">;
type WhatsAppTemplate = Tables<"whatsapp_templates">;

export interface ManualMessageWithDetails extends ManualMessage {
  customer?: Customer;
  template?: WhatsAppTemplate;
}

// Unified type for display in MessageHistory (covers both manual and broadcast)
export interface UnifiedMessage {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  message: string | null;
  subject: string | null;
  status: "pending" | "sent" | "delivered" | "failed";
  credits_used: number;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template_variables: Record<string, any> | null;
  template: WhatsAppTemplate | null | undefined;
  source: "manual" | "broadcast";
  recipient: string | null;
}

interface BroadcastLog {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  channel: string;
  recipient: string;
  subject: string | null;
  status: string;
  credits_used: number;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface UseManualMessagesOptions {
  customerId?: string;
  tenantId: string;
}

export interface SendMessageOptions {
  customerId: string;
  channel: "email" | "sms" | "whatsapp";
  message: string;
  subject?: string;
  templateId?: string;
  templateVariables?: Record<string, unknown>;
}

export function useManualMessages(options: UseManualMessagesOptions) {
  const { currentTenant, user } = useAuth();
  const { customerId, tenantId } = options;
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!tenantId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Run both queries in parallel
      const [manualResult, logsResult] = await Promise.all([
        supabase
          .from("manual_messages")
          .select(`*, customer:customers(*), template:whatsapp_templates(*)`)
          .eq("tenant_id", tenantId)
          .eq("customer_id", customerId ?? "")
          .order("created_at", { ascending: false }),

        customerId
          ? supabase
              .from("message_logs")
              .select("*")
              .eq("tenant_id", tenantId)
              .eq("customer_id", customerId)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as BroadcastLog[], error: null }),
      ]);

      if (manualResult.error) throw manualResult.error;
      if (logsResult.error) throw logsResult.error;

      const manualMessages: UnifiedMessage[] = ((manualResult.data as ManualMessageWithDetails[]) || []).map((m) => ({
        id: m.id,
        channel: m.channel as UnifiedMessage["channel"],
        message: m.message,
        subject: m.subject,
        status: m.status as UnifiedMessage["status"],
        credits_used: m.credits_used ?? 0,
        error_message: m.error_message,
        sent_at: m.sent_at,
        created_at: m.created_at,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template_variables: (m.template_variables as Record<string, any> | null) ?? null,
        template: m.template,
        source: "manual",
        recipient: null,
      }));

      const broadcastMessages: UnifiedMessage[] = ((logsResult.data as BroadcastLog[]) || []).map((log) => ({
        id: log.id,
        channel: log.channel as UnifiedMessage["channel"],
        message: null,
        subject: log.subject,
        status: log.status as UnifiedMessage["status"],
        credits_used: log.credits_used ?? 0,
        error_message: log.error_message,
        sent_at: log.sent_at,
        created_at: log.created_at,
        template_variables: null,
        template: null,
        source: "broadcast",
        recipient: log.recipient,
      }));

      const merged = [...manualMessages, ...broadcastMessages].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      setMessages(merged);
    } catch (err) {
      console.error("Error fetching manual messages:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, customerId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const sendMessage = async (messageOptions: SendMessageOptions) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    if (!user?.id) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      return null;
    }

    try {
      // Create manual_messages record
      const { data: newMessage, error: insertError } = await supabase
        .from("manual_messages")
        .insert({
          tenant_id: currentTenant.id,
          customer_id: messageOptions.customerId,
          channel: messageOptions.channel,
          message: messageOptions.message,
          subject: messageOptions.subject || null,
          template_id: messageOptions.templateId || null,
          template_variables: (messageOptions.templateVariables ?? null) as unknown as import("@supabase-client").Json,
          sent_by_user_id: user.id,
          status: "pending",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Invoke send-manual-message edge function
      const { data: sendResult, error: sendError } = await supabase.functions.invoke(
        "send-manual-message",
        {
          body: { messageId: newMessage.id },
        }
      );

      if (sendError) {
        let errorMessage = "Failed to send message";
        try {
          const functionPayload = await (sendError as { context?: Response }).context?.json?.();
          if (functionPayload?.error) {
            errorMessage = functionPayload.error;
          }
        } catch {
          // Ignore function body parsing errors and fall back to the generic message below.
        }
        throw new Error(errorMessage);
      }

      toast({
        title: "Success",
        description: `Message sent successfully via ${messageOptions.channel}`,
      });

      // Refresh messages list
      await fetchMessages();

      return sendResult;
    } catch (err) {
      console.error("Error sending message:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to send message";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      return null;
    }
  };

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    refetch: fetchMessages,
  };
}
