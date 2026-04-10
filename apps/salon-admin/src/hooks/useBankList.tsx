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

      setBanks((data?.banks as Bank[]) || []);
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
