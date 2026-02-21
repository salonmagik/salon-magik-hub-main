import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useToast } from "@ui/ui/use-toast";

export type MarketInterestStatus = "new" | "reviewing" | "contacted" | "qualified" | "closed";

export interface MarketInterestLead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_e164: string;
  country: string;
  city: string;
  salon_name: string;
  team_size: number | null;
  notes: string | null;
  source: string;
  status: MarketInterestStatus;
  created_at: string;
  updated_at: string;
}

interface MarketInterestFilters {
  status?: MarketInterestStatus | "all";
  country?: string;
}

export function useMarketInterest(filters?: MarketInterestFilters) {
  return useQuery({
    queryKey: ["market-interest", filters?.status, filters?.country],
    queryFn: async () => {
      let query = supabase
        .from("market_interest_leads" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      if (filters?.country) {
        query = query.eq("country", filters.country.toUpperCase());
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as MarketInterestLead[];
    },
  });
}

export function useMarketInterestActions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: MarketInterestStatus }) => {
      const { data, error } = await supabase
        .from("market_interest_leads" as any)
        .update({ status })
        .eq("id", leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-interest"] });
      toast({
        title: "Lead updated",
        description: "Market interest status saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    updateStatus,
  };
}
