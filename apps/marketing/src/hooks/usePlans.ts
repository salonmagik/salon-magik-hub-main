type Plan = {
  id: string;
  name: string;
  summary: string;
};

type PlanFeature = {
  plan_id: string;
  label: string;
  sort_order: number;
};

type PlanLimit = {
  plan_id: string;
  staff?: number | null;
  locations?: number | null;
};

const plans: Plan[] = [
  { id: "solo", name: "Solo", summary: "For independent operators" },
  { id: "studio", name: "Studio", summary: "For salons with small teams" },
  { id: "chain", name: "Chain", summary: "For multi-location salons" },
];

const planFeatures: PlanFeature[] = [
  { plan_id: "solo", label: "1 location", sort_order: 1 },
  { plan_id: "solo", label: "Online booking", sort_order: 2 },
  { plan_id: "solo", label: "Payments & deposits", sort_order: 3 },
  { plan_id: "studio", label: "Up to 10 staff", sort_order: 1 },
  { plan_id: "studio", label: "Packages & vouchers", sort_order: 2 },
  { plan_id: "studio", label: "Advanced appointment controls", sort_order: 3 },
  { plan_id: "chain", label: "Multiple locations", sort_order: 1 },
  { plan_id: "chain", label: "Location-level permissions", sort_order: 2 },
  { plan_id: "chain", label: "Central oversight", sort_order: 3 },
];

const planLimits: PlanLimit[] = [
  { plan_id: "solo", staff: 2, locations: 1 },
  { plan_id: "studio", staff: 10, locations: 1 },
  { plan_id: "chain", staff: null, locations: null },
];

export function usePlans() {
  return { data: plans, isLoading: false };
}

export function usePlanFeatures() {
  return { data: planFeatures, isLoading: false };
}

export function usePlanLimits() {
  return { data: planLimits, isLoading: false };
}
