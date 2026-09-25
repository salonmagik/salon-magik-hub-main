import { useState, useCallback, useEffect, useRef } from "react";
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

export function useSalonWalletAvailability(tenantId?: string, locationId?: string | null) {
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
        p_location_id: locationId ?? null,
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
  }, [tenantId, locationId]);

  useEffect(() => {
    if (tenantId) {
      fetchAvailability();
    }
  }, [tenantId, locationId, fetchAvailability]);

  // "Available" is computed from both the wallet balance and any pending
  // withdrawals — a withdrawal's status changing (e.g. the transfer.success/
  // failed webhook resolving it, with no action from whoever's looking at
  // this page) needs to be reflected without a manual refresh. Same
  // multi-mount-collision fix as useNotifications/useWithdrawals: this hook
  // is used by both PayoutsPage and WithdrawalDialog at once, so each
  // instance needs its own channel name.
  const instanceIdRef = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`salon-wallet-availability-${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "salon_withdrawals", filter: `tenant_id=eq.${tenantId}` },
        () => fetchAvailability(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "salon_wallets", filter: `tenant_id=eq.${tenantId}` },
        () => fetchAvailability(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, fetchAvailability]);

  return {
    availability,
    isLoading,
    error,
    refetch: fetchAvailability,
  };
}
