import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/supabase";
import type { KillSwitchValue, LegalStatus, MaintenanceBannerValue, MaintenancePlatform } from "./types";

export const LEGAL_STATUS_OPTIONS: { value: LegalStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "legal_approved", label: "Legal Approved" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
];

export const COMMON_CURRENCIES = ["GHS", "NGN"];

export function parseKillSwitch(value: Json | null): KillSwitchValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { enabled: false, reason: null, enabled_at: null, enabled_by: null };
  }
  const obj = value as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : false,
    reason: typeof obj.reason === "string" ? obj.reason : null,
    enabled_at: typeof obj.enabled_at === "string" ? obj.enabled_at : null,
    enabled_by: typeof obj.enabled_by === "string" ? obj.enabled_by : null,
  };
}

export function parseMaintBanner(value: Json | null): MaintenanceBannerValue {
  const defaults: MaintenanceBannerValue = {
    enabled: false,
    mode: "immediate",
    platforms: [],
    scheduled_at: null,
    title: "Scheduled Maintenance",
    description: "",
    guidance: "",
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const obj = value as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : defaults.enabled,
    mode: obj.mode === "scheduled" ? "scheduled" : "immediate",
    platforms: Array.isArray(obj.platforms)
      ? (obj.platforms as string[]).filter((p): p is MaintenancePlatform =>
          p === "salon_admin" || p === "client_portal"
        )
      : [],
    scheduled_at: typeof obj.scheduled_at === "string" ? obj.scheduled_at : null,
    title: typeof obj.title === "string" ? obj.title : defaults.title,
    description: typeof obj.description === "string" ? obj.description : "",
    guidance: typeof obj.guidance === "string" ? obj.guidance : "",
  };
}

export async function writeAuditLog(action: string, actorId: string | undefined, metadata: Json) {
  const { error } = await supabase.from("audit_logs").insert({
    action,
    entity_type: "platform_settings",
    entity_id: null,
    actor_user_id: actorId,
    metadata,
  });

  if (error) throw error;
}

// backoffice_step_up_challenges.resource_id is a real uuid column (it
// audits *which row* a step-up covered), so passing the platform_settings
// *key* string ("kill_switch"/"maintenance_banner") instead of its actual
// row id fails the insert with "invalid input syntax for type uuid" and
// surfaces to the user as a bare "Edge Function returned a non-2xx status
// code". These two settings are singleton rows with no id already loaded
// in the component, so fetch it fresh right before the step-up call.
export async function getPlatformSettingId(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("id")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}
