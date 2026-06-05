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
  const [messages, setMessages] = useState<ManualMessageWithDetails[]>([]);
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
      let query = supabase
        .from("manual_messages")
        .select(
          `
          *,
          customer:customers(*),
          template:whatsapp_templates(*)
        `
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (customerId) {
        query = query.eq("customer_id", customerId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setMessages((data as ManualMessageWithDetails[]) || []);
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
          template_variables: messageOptions.templateVariables || null,
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
