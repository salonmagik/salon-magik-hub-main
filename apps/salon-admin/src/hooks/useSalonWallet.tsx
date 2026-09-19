import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@supabase-client";

export type SalonWallet = Tables<"salon_wallets">;

export function useSalonWallet(tenantId?: string, locationId?: string | null) {
  const [wallet, setWallet] = useState<SalonWallet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchWallet = useCallback(async () => {
    if (!tenantId) {
      setWallet(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("salon_wallets")
        .select("*")
        .eq("tenant_id", tenantId);
      query = locationId
        ? query.eq("location_id", locationId)
        : query.is("location_id", null);
      const { data, error: fetchError } = await query.maybeSingle();

      if (fetchError) throw fetchError;

      setWallet(data as SalonWallet | null);
    } catch (err) {
      console.error("Error fetching salon wallet:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, locationId]);

  useEffect(() => {
    if (tenantId) {
      fetchWallet();
    }
  }, [tenantId, locationId, fetchWallet]);

  return {
    wallet,
    isLoading,
    error,
    refetch: fetchWallet,
  };
}
