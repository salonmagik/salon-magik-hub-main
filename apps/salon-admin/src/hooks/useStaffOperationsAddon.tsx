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
        .select("id,status,started_at,ends_at")
        .eq("tenant_id", currentTenant.id)
        .eq("addon_type", "staff_operations")
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; status: string; started_at: string; ends_at: string | null } | null;
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
  const expiresAt = entitlement?.ends_at ? new Date(entitlement.ends_at) : null;
  const isPlanEligible = ["studio", "chain"].includes(String(currentTenant?.plan || "").toLowerCase());
  const monthlyTotal = Number(pricing?.unit_price_per_location || 0) * locationCount;
  const hasValidPrice =
    typeof pricing?.currency === "string" &&
    pricing.currency.trim().length === 3 &&
    Number.isFinite(Number(pricing.unit_price_per_location));
  const priceLabel = hasValidPrice
    ? new Intl.NumberFormat("en", { style: "currency", currency: pricing!.currency, maximumFractionDigits: 2 }).format(monthlyTotal)
    : null;

  const refreshAfterChange = async () => {
    await queryClient.invalidateQueries({ queryKey: ["staff-operations-addon-entitlement", currentTenant?.id] });
    await queryClient.invalidateQueries({ queryKey: ["tenant-runtime-entitlements", currentTenant?.id] });
    await queryClient.invalidateQueries({ queryKey: ["tenant-recurring-total", currentTenant?.id] });
  };

  // Disabling is free and immediate. Enabling is a standalone, fixed-term
  // purchase — it's billed on its own 30-day term via Paystack, not folded
  // into the subscription's recurring total, so turning it off before that
  // term is up doesn't refund it and turning it back on starts a fresh term.
  const disable = async () => {
    if (!currentTenant?.id) return false;
    setIsUpdating(true);
    try {
      const { error } = await (supabase.rpc as any)("cancel_staff_operations_addon", {
        p_tenant_id: currentTenant.id,
        p_reason: "Disabled by owner",
      });
      if (error) throw error;
      await refreshAfterChange();
      toast({
        title: "Staff Operations disabled",
        description: "Check-ins and time-off management are turned off.",
      });
      return true;
    } catch (error: any) {
      toast({
        title: "Could not disable add-on",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  const purchase = async () => {
    if (!currentTenant?.id) return false;
    setIsUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-staff-operations-checkout-session", {
        body: {
          tenantId: currentTenant.id,
          successUrl: `${window.location.origin}${window.location.pathname}?staffopsaddon=success`,
          cancelUrl: `${window.location.origin}${window.location.pathname}?staffopsaddon=cancelled`,
        },
      });
      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
        return true;
      }

      // Charged immediately via stored card — no redirect needed.
      await refreshAfterChange();
      toast({
        title: "Staff Operations enabled",
        description: "Check-ins and time-off management are ready to use for the next 30 days.",
      });
      return true;
    } catch (error: any) {
      const isPlanIneligible = String(error?.message || "").includes("PLAN_NOT_ELIGIBLE") || String(error?.message || "").includes("STAFF_OPERATIONS_PURCHASE_FORBIDDEN");
      toast({
        title: "Could not enable add-on",
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

  const toggle = async () => (isEnabled ? disable() : purchase());

  return {
    isEnabled,
    expiresAt,
    isPlanEligible,
    locationCount,
    monthlyTotal,
    hasValidPrice,
    priceLabel,
    isUpdating,
    toggle,
    purchase,
    disable,
  };
}
