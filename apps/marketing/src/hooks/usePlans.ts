import { useQuery } from "@tanstack/react-query";
import { supabase } from "@supabase-client/supabase/client";

export interface Plan {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	display_order: number;
	is_active: boolean;
	is_recommended: boolean;
	trial_days: number;
}

export interface PlanFeature {
	id: string;
	plan_id: string;
	feature_text: string;
	sort_order: number;
}

export interface PlanLimit {
	id: string;
	plan_id: string;
	max_locations: number;
	max_staff: number;
	max_services: number | null;
	max_products: number | null;
	monthly_messages: number;
	features_enabled: Record<string, boolean>;
}

export function usePlans() {
	return useQuery({
		queryKey: ["plans"],
		queryFn: async (): Promise<Plan[]> => {
			const { data, error } = await supabase
				.from("plans")
				.select(
					"id, slug, name, description, display_order, is_active, is_recommended, trial_days",
				)
				.eq("is_active", true)
				.order("display_order", { ascending: true });

			if (error) throw error;
			return data || [];
		},
		staleTime: 1000 * 60 * 5,
	});
}

export function usePlanFeatures() {
	return useQuery({
		queryKey: ["plan-features"],
		queryFn: async (): Promise<PlanFeature[]> => {
			const { data, error } = await supabase
				.from("plan_features")
				.select("id, plan_id, feature_text, sort_order")
				.order("sort_order", { ascending: true });

			if (error) throw error;
			return data || [];
		},
		staleTime: 1000 * 60 * 5,
	});
}

export function usePlanLimits() {
	return useQuery({
		queryKey: ["plan-limits"],
		queryFn: async (): Promise<PlanLimit[]> => {
			const { data, error } = await supabase
				.from("plan_limits")
				.select(
					"id, plan_id, max_locations, max_staff, max_services, max_products, monthly_messages, features_enabled",
				);

			if (error) throw error;
			return (data || []).map((row) => ({
				...row,
				features_enabled: (row.features_enabled || {}) as Record<
					string,
					boolean
				>,
			}));
		},
		staleTime: 1000 * 60 * 5,
	});
}
