-- =============================================
-- Phase 1.1: Dynamic Pricing Tables
-- =============================================

-- Plans table (replaces hardcoded tiers)
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_recommended boolean NOT NULL DEFAULT false,
  trial_days int NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pricing per region/currency
CREATE TABLE public.plan_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES public.plans(id) ON DELETE CASCADE NOT NULL,
  currency text NOT NULL,
  monthly_price numeric NOT NULL,
  annual_price numeric NOT NULL DEFAULT 0,
  effective_monthly numeric NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, currency, valid_from)
);

-- Feature limits per plan
CREATE TABLE public.plan_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES public.plans(id) ON DELETE CASCADE NOT NULL UNIQUE,
  max_locations int NOT NULL DEFAULT 1,
  max_staff int NOT NULL DEFAULT 1,
  max_services int,
  max_products int,
  monthly_messages int NOT NULL DEFAULT 30,
  features_enabled jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Display features for pricing cards
CREATE TABLE public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES public.plans(id) ON DELETE CASCADE NOT NULL,
  feature_text text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Public can read active plans
CREATE POLICY "Anyone can read active plans"
ON public.plans FOR SELECT
USING (is_active = true);

CREATE POLICY "Anyone can read plan pricing"
ON public.plan_pricing FOR SELECT
USING (plan_id IN (SELECT id FROM public.plans WHERE is_active = true));

CREATE POLICY "Anyone can read plan limits"
ON public.plan_limits FOR SELECT
USING (plan_id IN (SELECT id FROM public.plans WHERE is_active = true));

CREATE POLICY "Anyone can read plan features"
ON public.plan_features FOR SELECT
USING (plan_id IN (SELECT id FROM public.plans WHERE is_active = true));

-- Triggers for updated_at
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plan_limits_updated_at
  BEFORE UPDATE ON public.plan_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();