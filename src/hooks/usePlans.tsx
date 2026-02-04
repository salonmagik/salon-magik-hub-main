import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlanFeature {
  id: string;
  feature_text: string;
  sort_order: number;
}

export interface PlanLimit {
  max_locations: number;
  max_staff: number;
  max_services: number | null;
  max_products: number | null;
  monthly_messages: number;
  features_enabled: Record<string, boolean>;
}

export interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  is_recommended: boolean;
  trial_days: number;
  features: PlanFeature[];
  limits: PlanLimit | null;
}

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async (): Promise<Plan[]> => {
      // Fetch plans
      const { data: plans, error: plansError } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (plansError) throw plansError;
      if (!plans) return [];

      // Fetch features for all plans
      const { data: features, error: featuresError } = await supabase
        .from("plan_features")
        .select("*")
        .in("plan_id", plans.map((p) => p.id))
        .order("sort_order", { ascending: true });

      if (featuresError) throw featuresError;

      // Fetch limits for all plans
      const { data: limits, error: limitsError } = await supabase
        .from("plan_limits")
        .select("*")
        .in("plan_id", plans.map((p) => p.id));

      if (limitsError) throw limitsError;

      // Combine data
      return plans.map((plan) => ({
        id: plan.id,
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        display_order: plan.display_order,
        is_active: plan.is_active,
        is_recommended: plan.is_recommended,
        trial_days: plan.trial_days,
        features: (features || [])
          .filter((f) => f.plan_id === plan.id)
          .map((f) => ({
            id: f.id,
            feature_text: f.feature_text,
            sort_order: f.sort_order,
          })),
        limits: limits?.find((l) => l.plan_id === plan.id)
          ? {
              max_locations: limits.find((l) => l.plan_id === plan.id)!.max_locations,
              max_staff: limits.find((l) => l.plan_id === plan.id)!.max_staff,
              max_services: limits.find((l) => l.plan_id === plan.id)!.max_services,
              max_products: limits.find((l) => l.plan_id === plan.id)!.max_products,
              monthly_messages: limits.find((l) => l.plan_id === plan.id)!.monthly_messages,
              features_enabled: limits.find((l) => l.plan_id === plan.id)!.features_enabled as Record<string, boolean>,
            }
          : null,
      }));
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

export function usePlanBySlug(slug: string) {
  const { data: plans, ...rest } = usePlans();
  return {
    ...rest,
    data: plans?.find((p) => p.slug === slug),
  };
}

// Separate hooks for features and limits (for PricingPage compatibility)
export function usePlanFeatures() {
  return useQuery({
    queryKey: ["plan-features"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_features")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function usePlanLimits() {
  return useQuery({
    queryKey: ["plan-limits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_limits").select("*");

      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });
}
