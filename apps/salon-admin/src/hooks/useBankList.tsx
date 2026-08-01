import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface Bank {
  id: number;
  name: string;
  code: string;
  type: string;
  slug: string;
  currency: string;
}

// Paystack's bank list contains near-duplicate entries for the same institution
// (e.g. "Absa Bank Ghana Limited" vs "Absa Bank Ghana Ltd", or the exact same
// name twice). Collapse them by a normalized name key so the picker shows each
// bank once. We keep the first occurrence's code; the account-number
// verification step still validates the selected bank+account before saving.
function dedupeBanks(banks: Bank[]): Bank[] {
  const seen = new Set<string>();
  const out: Bank[] = [];
  for (const bank of banks) {
    const key = bank.name
      .toLowerCase()
      .replace(/[.,]/g, "")
      .replace(/\b(limited|ltd)\b/g, "ltd")
      .replace(/\bplc\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (seen.has(key) || seen.has(bank.code)) continue;
    seen.add(key);
    seen.add(bank.code);
    out.push(bank);
  }
  return out;
}

export function useBankList(country: "NG" | "GH", type?: "bank" | "mobile_money") {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBanks = useCallback(async () => {
    if (!country) {
      setBanks([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke("get-banks-and-momo-providers", {
        body: {
          country,
          type,
        },
      });

      if (error) throw error;

      setBanks(dedupeBanks((data?.banks as Bank[]) || []));
    } catch (err) {
      console.error("Error fetching banks:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [country, type]);

  useEffect(() => {
    if (country) {
      fetchBanks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, type]);

  return {
    banks,
    isLoading,
    error,
    refetch: fetchBanks,
  };
}
