import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface SalonWalletAvailability {
  balance: number;
  available: number;
  pending: number;
  currency: string | null;
  nextSettlementAt: string | null;
}

interface WalletAvailabilityRow {
  balance: number;
  available: number;
  pending: number;
  currency: string | null;
  next_settlement_at: string | null;
}

export function useSalonWalletAvailability(tenantId?: string) {
  const [availability, setAvailability] = useState<SalonWalletAvailability | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchAvailability = useCallback(async () => {
    if (!tenantId) {
      setAvailability(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase.rpc("get_salon_wallet_availability" as never, {
        p_tenant_id: tenantId,
      } as never);

      if (fetchError) throw fetchError;

      const row = (data as WalletAvailabilityRow[] | null)?.[0];
      setAvailability(
        row
          ? {
              balance: Number(row.balance),
              available: Number(row.available),
              pending: Number(row.pending),
              currency: row.currency,
              nextSettlementAt: row.next_settlement_at,
            }
          : null,
      );
    } catch (err) {
      console.error("Error fetching salon wallet availability:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      fetchAvailability();
    }
  }, [tenantId, fetchAvailability]);

  return {
    availability,
    isLoading,
    error,
    refetch: fetchAvailability,
  };
}
