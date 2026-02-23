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

export function useBankList(country: "NG" | "GH", type?: "mobile_money") {
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
      // Build query params
      const params = new URLSearchParams({ country });
      if (type) {
        params.append("type", type);
      }

      // Get the edge function URL
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const functionUrl = `${supabaseUrl}/functions/v1/get-banks-and-momo-providers?${params.toString()}`;
      
      const response = await fetch(functionUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${session?.access_token || anonKey}`,
          "apikey": anonKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch banks");
      }

      const data = await response.json();
      setBanks((data.banks as Bank[]) || []);
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
  }, [country, type, fetchBanks]);

  return {
    banks,
    isLoading,
    error,
    refetch: fetchBanks,
  };
}
