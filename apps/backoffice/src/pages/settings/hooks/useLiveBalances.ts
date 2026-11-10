import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Read-only live balance pulls from Arkesel (SMS) and Paystack — nothing stored locally. */
export function useLiveBalances() {
  const {
    data: arkeselBalance,
    isLoading: arkeselBalanceLoading,
    refetch: refetchArkeselBalance,
    isRefetching: arkeselBalanceRefetching,
  } = useQuery({
    queryKey: ["arkesel-balance"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-arkesel-balance");
      if (error) throw error;
      type BalanceEntry = { sms_balance: number | null; main_balance: string | null; error?: string };
      return data as { gh: BalanceEntry; ng_transactional: BalanceEntry; ng_promotional: BalanceEntry };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const {
    data: paystackBalance,
    isLoading: paystackBalanceLoading,
    refetch: refetchPaystackBalance,
    isRefetching: paystackBalanceRefetching,
  } = useQuery({
    queryKey: ["paystack-balance"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-paystack-balance");
      if (error) throw error;
      type BalanceEntry = { balance: number | null; currency: string | null; error?: string };
      return data as { ng: BalanceEntry; gh: BalanceEntry };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    arkeselBalance,
    arkeselBalanceLoading,
    refetchArkeselBalance,
    arkeselBalanceRefetching,

    paystackBalance,
    paystackBalanceLoading,
    refetchPaystackBalance,
    paystackBalanceRefetching,
  };
}
