import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

/**
 * Shared by StaffPage (where the add-on lives conceptually) and the
 * subscription tab (where owners actually expect to see and manage billed
 * add-ons) — same entitlement, same pricing, same toggle action either way.
 */
export function useStaffOperationsAddon() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: pricing } = useQuery({
    queryKey: ["staff-operations-addon-pricing", currentTenant?.country, currentTenant?.currency],
    queryFn: async () => {
      if (!currentTenant?.country || !currentTenant?.currency) return null;
      const { data, error } = await (supabase.from as any)("staff_operations_addon_pricing")
        .select("id,currency,unit_price_per_location")
        .eq("country_code", currentTenant.country)
        .eq("currency", currentTenant.currency)
        .eq("status", "active")
        .lte("effective_from", new Date().toISOString())
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; currency: string; unit_price_per_location: number } | null;
    },
    enabled: Boolean(currentTenant?.country && currentTenant?.currency),
  });

  const { data: entitlement } = useQuery({
    queryKey: ["staff-operations-addon-entitlement", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return null;
      const { data, error } = await (supabase.from as any)("tenant_addon_entitlements")
        .select("id,status,started_at")
        .eq("tenant_id", currentTenant.id)
        .eq("addon_type", "staff_operations")
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; status: string; started_at: string } | null;
    },
    enabled: Boolean(currentTenant?.id),
  });

  const { data: locationCount = 1 } = useQuery({
    queryKey: ["staff-operations-location-count", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return 1;
      const { count, error } = await supabase
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return Math.max(count || 0, 1);
    },
    enabled: Boolean(currentTenant?.id),
  });

  const isEnabled = Boolean(entitlement?.id);
  const isPlanEligible = ["studio", "chain"].includes(String(currentTenant?.plan || "").toLowerCase());
  const monthlyTotal = Number(pricing?.unit_price_per_location || 0) * locationCount;
  const hasValidPrice =
    typeof pricing?.currency === "string" &&
    pricing.currency.trim().length === 3 &&
    Number.isFinite(Number(pricing.unit_price_per_location));
  const priceLabel = hasValidPrice
    ? new Intl.NumberFormat("en", { style: "currency", currency: pricing!.currency, maximumFractionDigits: 2 }).format(monthlyTotal)
    : null;

  const toggle = async () => {
    if (!currentTenant?.id) return;
    setIsUpdating(true);
    try {
      const functionName = isEnabled ? "cancel_staff_operations_addon" : "activate_staff_operations_addon";
      const { error } = await (supabase.rpc as any)(functionName, {
        p_tenant_id: currentTenant.id,
        p_reason: isEnabled ? "Disabled by owner" : "Enabled by owner",
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["staff-operations-addon-entitlement", currentTenant?.id] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-runtime-entitlements", currentTenant?.id] });
      toast({
        title: isEnabled ? "Staff Operations disabled" : "Staff Operations enabled",
        description: isEnabled
          ? "Check-ins and time-off management are no longer billed."
          : "Check-ins and time-off management are ready to use.",
      });
      return true;
    } catch (error: any) {
      const isPlanIneligible = String(error?.message || "").includes("PLAN_NOT_ELIGIBLE");
      toast({
        title: "Could not update add-on",
        description: isPlanIneligible
          ? "Staff Operations is available on Studio and Chain plans. Upgrade your plan to enable it."
          : error?.message || "Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    isEnabled,
    isPlanEligible,
    locationCount,
    monthlyTotal,
    hasValidPrice,
    priceLabel,
    isUpdating,
    toggle,
  };
}
