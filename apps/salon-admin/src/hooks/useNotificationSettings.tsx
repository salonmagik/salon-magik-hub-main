import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export interface NotificationSettings {
  id: string;
  tenant_id: string;
  location_id: string | null;
  email_appointment_reminders: boolean;
  sms_appointment_reminders: boolean;
  email_new_bookings: boolean;
  email_cancellations: boolean;
  email_transaction_alerts: boolean;
  in_app_transaction_alerts: boolean;
  digest_frequency: "off" | "daily" | "weekly" | "monthly";
  email_birthday_messages: boolean;
  reminder_hours_before: number;
  reminder_extra_minutes_before: number | null;
  created_at: string;
  updated_at: string;
}

type NotificationSettingsUpdates = Partial<Omit<NotificationSettings, "id" | "tenant_id" | "created_at" | "updated_at">>;

const defaultSettings: Omit<NotificationSettings, "id" | "tenant_id" | "location_id" | "created_at" | "updated_at"> = {
  email_appointment_reminders: true,
  sms_appointment_reminders: false,
  email_new_bookings: true,
  email_cancellations: true,
  email_transaction_alerts: true,
  in_app_transaction_alerts: true,
  digest_frequency: "daily",
  email_birthday_messages: true,
  reminder_hours_before: 24,
  reminder_extra_minutes_before: null,
};

function withDefaults(
  tenantId: string,
  row?: Partial<NotificationSettings> | null,
  locationId: string | null = null,
): NotificationSettings {
  return {
    ...defaultSettings,
    id: row?.id || "",
    tenant_id: tenantId,
    location_id: row?.location_id ?? locationId,
    created_at: row?.created_at || "",
    updated_at: row?.updated_at || "",
    ...row,
  } as NotificationSettings;
}

/**
 * Loads the tenant-wide notification row plus any branch overrides. Passing a
 * location id makes `settings` the effective settings for that branch while
 * `saveSettings` still writes an override for that branch.
 */
export function useNotificationSettings(locationId: string | null = null) {
  const { currentTenant } = useAuth();
  const [rows, setRows] = useState<NotificationSettings[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!currentTenant?.id) {
      setRows([]);
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
        .order("location_id", { ascending: true, nullsFirst: true });

      if (fetchError) throw fetchError;
      setRows((data as NotificationSettings[]) || []);
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

  const getSettingsForLocation = useCallback(
    (targetLocationId: string | null) => {
      const exact = targetLocationId
        ? rows.find((row) => row.location_id === targetLocationId)
        : rows.find((row) => row.location_id === null);
      const global = rows.find((row) => row.location_id === null);
      return withDefaults(currentTenant?.id || "", exact || global, targetLocationId);
    },
    [currentTenant?.id, rows],
  );

  const settings = useMemo(
    () => getSettingsForLocation(locationId),
    [getSettingsForLocation, locationId],
  );

  const saveSettings = async (
    updates: NotificationSettingsUpdates,
    targetLocationId: string | null = locationId,
  ) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return false;
    }

    setIsSaving(true);

    try {
      const existing = rows.find((row) => row.location_id === (targetLocationId || null));
      if (existing) {
        const { error: updateError } = await supabase
          .from("notification_settings")
          .update(updates)
          .eq("id", existing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("notification_settings")
          .insert({
            tenant_id: currentTenant.id,
            location_id: targetLocationId || null,
            ...defaultSettings,
            ...updates,
          });
        if (insertError) throw insertError;
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

  return {
    settings,
    settingsRows: rows,
    getSettingsForLocation,
    isLoading,
    isSaving,
    error,
    refetch: fetchSettings,
    saveSettings,
  };
}
