import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface OwnerStandingSalon {
  tenantId: string;
  name: string;
  plan: string | null;
  subscriptionStatus: string | null;
  inGoodStanding: boolean;
}

export interface OwnerStanding {
  allGood: boolean;
  salons: OwnerStandingSalon[];
}

/**
 * Wraps assess_owner_multi_salon_standing (super-admin gated) — the
 * standing table a reviewer sees before granting an additional-salon
 * ownership exception. Not enabled until a target identity is chosen.
 */
export function useOwnerStanding(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["owner-multi-salon-standing", userId],
    queryFn: async (): Promise<OwnerStanding> => {
      const { data, error } = await (supabase.rpc as any)("assess_owner_multi_salon_standing", {
        p_user_id: userId,
      });
      if (error) throw error;
      return {
        allGood: Boolean(data?.allGood),
        salons: Array.isArray(data?.salons) ? data.salons : [],
      };
    },
    enabled: Boolean(userId),
  });
}
