import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@supabase-client";

export type WalletLedgerEntry = Tables<"wallet_ledger_entries">;

interface UseWalletLedgerOptions {
  walletType: "customer" | "salon";
  walletId?: string;
  limit?: number;
}

export function useWalletLedger({
  walletType,
  walletId,
  limit = 100,
}: UseWalletLedgerOptions) {
  const [entries, setEntries] = useState<WalletLedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!walletId) {
      setEntries([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("wallet_ledger_entries")
        .select("*")
        .eq("wallet_type", walletType)
        .eq("wallet_id", walletId)
        .order("created_at", { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setEntries(data as WalletLedgerEntry[] || []);
    } catch (err) {
      console.error("Error fetching wallet ledger entries:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [walletType, walletId, limit]);

  useEffect(() => {
    if (walletId) {
      fetchEntries();
    }
  }, [walletId, fetchEntries]);

  return {
    entries,
    isLoading,
    error,
    refetch: fetchEntries,
  };
}
