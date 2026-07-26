import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useLocationScope } from "@/hooks/useLocationScope";

export interface CashLedgerEntry {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  occurred_at: string;
  appointment: {
    id: string;
    booking_reference: string | null;
    scheduled_start: string | null;
    total_amount: number;
    amount_paid: number;
    location: { id: string; name: string } | null;
  } | null;
  customer: { id: string; full_name: string } | null;
}

export function useCashLedger() {
  const { currentTenant } = useAuth();
  const { scopedLocationIds, hasScope } = useLocationScope();
  const [entries, setEntries] = useState<CashLedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!currentTenant?.id) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const query = supabase
      .from("journal_entries")
      .select(`
        id, amount, currency, description, occurred_at,
        appointment:appointments(id, booking_reference, scheduled_start, total_amount, amount_paid, location:locations(id, name)),
        customer:customers(id, full_name)
      `)
      .eq("tenant_id", currentTenant.id)
      .eq("direction", "inflow")
      .eq("payment_method", "cash")
      .eq("status", "active")
      .not("appointment_id", "is", null)
      .order("occurred_at", { ascending: false });

    const { data, error: fetchError } = await query;
    if (fetchError) {
      setError(new Error(fetchError.message));
      setEntries([]);
    } else {
      setError(null);
      const scopedEntries = (data || []) as unknown as CashLedgerEntry[];
      setEntries(
        hasScope
          ? scopedEntries.filter((entry) => entry.appointment?.location?.id && scopedLocationIds.includes(entry.appointment.location.id))
          : scopedEntries,
      );
    }
    setIsLoading(false);
  }, [currentTenant?.id, hasScope, scopedLocationIds]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { entries, isLoading, error, refetch };
}
