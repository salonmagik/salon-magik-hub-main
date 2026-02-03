import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

export interface NotificationSettings {
  id: string;
  tenant_id: string;
  email_appointment_reminders: boolean;
  sms_appointment_reminders: boolean;
  email_new_bookings: boolean;
  email_cancellations: boolean;
  email_daily_digest: boolean;
  reminder_hours_before: number;
  created_at: string;
  updated_at: string;
}

const defaultSettings: Omit<NotificationSettings, "id" | "tenant_id" | "created_at" | "updated_at"> = {
  email_appointment_reminders: true,
  sms_appointment_reminders: false,
  email_new_bookings: true,
  email_cancellations: true,
  email_daily_digest: false,
  reminder_hours_before: 24,
};

export function useNotificationSettings() {
  const { currentTenant } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!currentTenant?.id) {
      setSettings(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      setSettings(data as NotificationSettings | null);
    } catch (err) {
      console.error("Error fetching notification settings:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async (updates: Partial<Omit<NotificationSettings, "id" | "tenant_id" | "created_at" | "updated_at">>) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return false;
    }

    setIsSaving(true);

    try {
      if (settings) {
        // Update existing
        const { error } = await supabase
          .from("notification_settings")
          .update(updates)
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("notification_settings")
          .insert({
            tenant_id: currentTenant.id,
            ...defaultSettings,
            ...updates,
          });

        if (error) throw error;
      }

      toast({ title: "Success", description: "Notification settings saved" });
      await fetchSettings();
      return true;
    } catch (err) {
      console.error("Error saving notification settings:", err);
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Return current settings or defaults
  const currentSettings = settings || {
    ...defaultSettings,
    id: "",
    tenant_id: currentTenant?.id || "",
    created_at: "",
    updated_at: "",
  };

  return {
    settings: currentSettings,
    isLoading,
    isSaving,
    error,
    refetch: fetchSettings,
    saveSettings,
  };
}
