import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "@ui/ui/use-toast";

export interface Voucher {
  id: string;
  tenant_id: string;
  code: string;
  amount: number;
  balance: number;
  status: "active" | "redeemed" | "expired" | "cancelled";
  purchased_by_customer_id: string | null;
  redeemed_by_customer_id: string | null;
  claimed_by_customer_id?: string | null;
  claimed_at?: string | null;
  target_customer_id?: string | null;
  voucher_type?: "gift" | "promotion";
  access_type?: "public" | "private";
  discount_type?: "fixed" | "percentage";
  discount_value?: number;
  minimum_spend?: number;
  max_redemptions?: number | null;
  per_customer_limit?: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useVouchers() {
  const { currentTenant, activeLocationId } = useAuth();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchVouchers = useCallback(async () => {
    if (!currentTenant?.id) {
      setVouchers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let scopedVoucherIds: string[] | null = null;
      if (activeLocationId) {
        const { data: mappings, error: mappingError } = await (supabase.from as any)("voucher_locations")
          .select("voucher_id")
          .eq("tenant_id", currentTenant.id)
          .eq("location_id", activeLocationId)
          .eq("is_enabled", true);
        if (mappingError) throw mappingError;
        scopedVoucherIds = Array.from(
          new Set(((mappings ?? []) as Array<{ voucher_id: string }>).map((row) => row.voucher_id)),
        );
      }

      if (scopedVoucherIds && scopedVoucherIds.length === 0) {
        setVouchers([]);
        return;
      }

      let query = supabase
        .from("vouchers")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (scopedVoucherIds) {
        query = query.in("id", scopedVoucherIds);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setVouchers((data as Voucher[]) || []);
    } catch (err) {
      console.error("Error fetching vouchers:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [activeLocationId, currentTenant?.id]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const resolveCreateLocationScope = async (tenantId: string, requestedLocationIds?: string[]) => {
    const isChainTier = String(currentTenant?.plan || "").toLowerCase() === "chain";
    const normalizedRequested = Array.from(new Set((requestedLocationIds ?? []).filter(Boolean)));
    const targetLocationIds = isChainTier
      ? normalizedRequested
      : Array.from(new Set([activeLocationId, ...normalizedRequested].filter(Boolean) as string[]));

    if (targetLocationIds.length === 0) {
      throw new Error(
        isChainTier
          ? "Select at least one branch before creating this item."
          : "No branch context found. Switch to a branch and try again.",
      );
    }

    const { data: locations, error } = await supabase
      .from("locations")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", targetLocationIds)
      .or("availability.is.null,availability.eq.open");
    if (error) throw error;
    const validLocationIds = Array.from(new Set((locations ?? []).map((row) => row.id)));
    if (validLocationIds.length !== targetLocationIds.length) {
      throw new Error("Some selected branches are unavailable. Refresh and try again.");
    }
    return validLocationIds;
  };

  const assignVoucherToLocations = async (tenantId: string, voucherId: string, locationIds: string[]) => {
    if (locationIds.length === 0) {
      throw new Error("No branch scope was provided for this voucher.");
    }

    const rows = locationIds.map((locationId) => ({
      tenant_id: tenantId,
      voucher_id: voucherId,
      location_id: locationId,
      is_enabled: true,
    }));

    const { error: mappingError } = await (supabase.from as any)("voucher_locations").upsert(rows, {
      onConflict: "voucher_id,location_id",
    });
    if (mappingError) throw mappingError;

    const { data: verifyRows, error: verifyError } = await (supabase.from as any)("voucher_locations")
      .select("location_id")
      .eq("tenant_id", tenantId)
      .eq("voucher_id", voucherId)
      .eq("is_enabled", true)
      .in("location_id", locationIds);
    if (verifyError) throw verifyError;
    const verifiedLocationIds = new Set(((verifyRows ?? []) as Array<{ location_id: string }>).map((row) => row.location_id));
    if (verifiedLocationIds.size !== locationIds.length) {
      throw new Error("Voucher branch mapping could not be verified. Please retry.");
    }
  };

  const createVoucher = async (data: {
    code: string;
    amount: number;
    expiresAt?: string;
    purchasedByCustomerId?: string;
    locationIds?: string[];
    voucherType?: "gift" | "promotion";
    accessType?: "public" | "private";
    discountType?: "fixed" | "percentage";
    targetCustomerId?: string;
    minimumSpend?: number;
    maxRedemptions?: number;
  }) => {
    if (!currentTenant?.id) {
      toast({ title: "Error", description: "No active tenant", variant: "destructive" });
      return null;
    }

    try {
      const locationScope = await resolveCreateLocationScope(currentTenant.id, data.locationIds);
      const { data: voucher, error } = await supabase
        .from("vouchers")
        .insert({
          tenant_id: currentTenant.id,
          code: data.code.toUpperCase(),
          amount: data.amount,
          balance: data.amount,
          expires_at: data.expiresAt || null,
          purchased_by_customer_id: data.purchasedByCustomerId || null,
          target_customer_id: data.targetCustomerId || null,
          voucher_type: data.voucherType || "gift",
          access_type: data.accessType || "public",
          discount_type: data.discountType || "fixed",
          discount_value: data.amount,
          minimum_spend: data.minimumSpend || 0,
          max_redemptions: data.maxRedemptions || null,
        } as never)
        .select()
        .single();

      if (error) throw error;
      await assignVoucherToLocations(currentTenant.id, voucher.id, locationScope);

      if (
        data.accessType === "private" &&
        data.voucherType === "gift" &&
        data.discountType === "fixed" &&
        data.targetCustomerId
      ) {
        const { error: claimError } = await supabase.rpc("claim_voucher_to_balance" as never, {
          p_tenant_id: currentTenant.id,
          p_customer_id: data.targetCustomerId,
          p_code: voucher.code,
        } as never);
        if (claimError) throw claimError;
      }

      toast({ title: "Success", description: "Voucher created successfully" });
      await fetchVouchers();
      return voucher;
    } catch (err: any) {
      console.error("Error creating voucher:", err);
      const customMessage = typeof err?.message === "string" ? err.message : null;
      const isLimitReached = customMessage?.includes("RESOURCE_LIMIT_REACHED");
      toast({
        title: isLimitReached ? "Voucher limit reached" : "Error",
        description: isLimitReached
          ? "Your plan allows up to 5 active vouchers. Let existing vouchers redeem or expire, or upgrade your plan to add more."
          : customMessage?.includes("unique")
            ? "Voucher code already exists"
            : customMessage || "Failed to create voucher",
        variant: "destructive",
      });
      return null;
    }
  };

  const updateVoucher = async (id: string, updates: Partial<Pick<Voucher, "status" | "balance" | "redeemed_by_customer_id">>) => {
    try {
      const { error } = await supabase
        .from("vouchers")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: "Voucher updated" });
      await fetchVouchers();
      return true;
    } catch (err) {
      console.error("Error updating voucher:", err);
      toast({ title: "Error", description: "Failed to update voucher", variant: "destructive" });
      return false;
    }
  };

  return {
    vouchers,
    isLoading,
    error,
    refetch: fetchVouchers,
    createVoucher,
    updateVoucher,
  };
}
