import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

interface OfferResult {
  eligible: boolean;
  annual_offer_id: string | null;
  eligible_until: string | null;
  bonus_trial_days: number;
  reason: string;
}

export function AnnualLockinBanner() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();

  const { data } = useQuery({
    queryKey: ["annual-lockin-offer", currentTenant?.id],
    queryFn: async (): Promise<OfferResult | null> => {
      if (!currentTenant?.id) return null;

      const { data, error } = await (supabase.rpc as any)("evaluate_tenant_annual_lockin_offer", {
        p_tenant_id: currentTenant.id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row || null;
    },
    enabled: Boolean(currentTenant?.id),
    staleTime: 60_000,
  });

  const formattedDeadline = useMemo(() => {
    if (!data?.eligible_until) return null;
    return new Date(data.eligible_until).toLocaleString();
  }, [data?.eligible_until]);

  if (!data?.eligible) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 lg:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-900">Lock in annual billing today</p>
          <p className="text-sm text-amber-800">
            Pay for annual now and get +{data.bonus_trial_days} free day{data.bonus_trial_days === 1 ? "" : "s"} before billing starts.
            {formattedDeadline ? ` Offer expires ${formattedDeadline}.` : ""}
          </p>
        </div>
        <Button
          size="sm"
          className="w-full md:w-auto"
          onClick={() => navigate("/salon/settings?tab=billing")}
        >
          Pay Now
        </Button>
      </div>
    </div>
  );
}
