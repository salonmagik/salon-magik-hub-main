-- ============================================
-- Phase 6: BackOffice Extended - Database Schema
-- ============================================

-- 1. Allow BackOffice users to manage feature flags (INSERT, UPDATE, DELETE)
CREATE POLICY "BackOffice users can create feature flags"
ON public.feature_flags
FOR INSERT
TO authenticated
WITH CHECK (is_backoffice_user(auth.uid()));

CREATE POLICY "BackOffice users can update feature flags"
ON public.feature_flags
FOR UPDATE
TO authenticated
USING (is_backoffice_user(auth.uid()))
WITH CHECK (is_backoffice_user(auth.uid()));

CREATE POLICY "BackOffice users can delete feature flags"
ON public.feature_flags
FOR DELETE
TO authenticated
USING (is_backoffice_user(auth.uid()));

-- 2. Allow BackOffice users to manage plans
CREATE POLICY "BackOffice users can read all plans"
ON public.plans
FOR SELECT
TO authenticated
USING (is_backoffice_user(auth.uid()));

CREATE POLICY "BackOffice users can update plans"
ON public.plans
FOR UPDATE
TO authenticated
USING (has_backoffice_role(auth.uid(), 'super_admin'))
WITH CHECK (has_backoffice_role(auth.uid(), 'super_admin'));

CREATE POLICY "BackOffice users can create plans"
ON public.plans
FOR INSERT
TO authenticated
WITH CHECK (has_backoffice_role(auth.uid(), 'super_admin'));

-- 3. Allow BackOffice users to manage plan pricing
CREATE POLICY "BackOffice users can read all pricing"
ON public.plan_pricing
FOR SELECT
TO authenticated
USING (is_backoffice_user(auth.uid()));

CREATE POLICY "BackOffice super admins can update pricing"
ON public.plan_pricing
FOR UPDATE
TO authenticated
USING (has_backoffice_role(auth.uid(), 'super_admin'))
WITH CHECK (has_backoffice_role(auth.uid(), 'super_admin'));

CREATE POLICY "BackOffice super admins can create pricing"
ON public.plan_pricing
FOR INSERT
TO authenticated
WITH CHECK (has_backoffice_role(auth.uid(), 'super_admin'));

-- 4. Allow BackOffice to manage plan features
CREATE POLICY "BackOffice users can read all plan features"
ON public.plan_features
FOR SELECT
TO authenticated
USING (is_backoffice_user(auth.uid()));

CREATE POLICY "BackOffice super admins can update plan features"
ON public.plan_features
FOR UPDATE
TO authenticated
USING (has_backoffice_role(auth.uid(), 'super_admin'))
WITH CHECK (has_backoffice_role(auth.uid(), 'super_admin'));

CREATE POLICY "BackOffice super admins can create plan features"
ON public.plan_features
FOR INSERT
TO authenticated
WITH CHECK (has_backoffice_role(auth.uid(), 'super_admin'));

CREATE POLICY "BackOffice super admins can delete plan features"
ON public.plan_features
FOR DELETE
TO authenticated
USING (has_backoffice_role(auth.uid(), 'super_admin'));

-- 5. Allow BackOffice to manage plan limits
CREATE POLICY "BackOffice users can read all plan limits"
ON public.plan_limits
FOR SELECT
TO authenticated
USING (is_backoffice_user(auth.uid()));

CREATE POLICY "BackOffice super admins can update plan limits"
ON public.plan_limits
FOR UPDATE
TO authenticated
USING (has_backoffice_role(auth.uid(), 'super_admin'))
WITH CHECK (has_backoffice_role(auth.uid(), 'super_admin'));

CREATE POLICY "BackOffice super admins can create plan limits"
ON public.plan_limits
FOR INSERT
TO authenticated
WITH CHECK (has_backoffice_role(auth.uid(), 'super_admin'));

-- 6. Create impersonation_sessions table for audit trail
CREATE TABLE public.impersonation_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    backoffice_user_id uuid NOT NULL REFERENCES public.backoffice_users(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    reason text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on impersonation_sessions
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Only BackOffice users can access impersonation sessions
CREATE POLICY "BackOffice users can read impersonation sessions"
ON public.impersonation_sessions
FOR SELECT
TO authenticated
USING (is_backoffice_user(auth.uid()));

CREATE POLICY "BackOffice users can create impersonation sessions"
ON public.impersonation_sessions
FOR INSERT
TO authenticated
WITH CHECK (is_backoffice_user(auth.uid()));

CREATE POLICY "BackOffice users can update own impersonation sessions"
ON public.impersonation_sessions
FOR UPDATE
TO authenticated
USING (backoffice_user_id = (SELECT id FROM public.backoffice_users WHERE user_id = auth.uid()))
WITH CHECK (backoffice_user_id = (SELECT id FROM public.backoffice_users WHERE user_id = auth.uid()));

-- 7. Add kill_switch setting to platform_settings if not exists
INSERT INTO public.platform_settings (key, value, description)
VALUES ('kill_switch', '{"enabled": false, "reason": null, "enabled_at": null, "enabled_by": null}'::jsonb, 'Platform-wide read-only mode toggle (Super Admin only)')
ON CONFLICT (key) DO NOTHING;

-- 8. Create stripe_customers table for billing
CREATE TABLE public.stripe_customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    stripe_customer_id text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owners can read own stripe customer"
ON public.stripe_customers
FOR SELECT
TO authenticated
USING (is_tenant_owner(auth.uid(), tenant_id));

CREATE POLICY "BackOffice users can read all stripe customers"
ON public.stripe_customers
FOR SELECT
TO authenticated
USING (is_backoffice_user(auth.uid()));

-- 9. Create subscriptions table for billing history
CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.plans(id),
    stripe_subscription_id text UNIQUE,
    stripe_price_id text,
    status text NOT NULL DEFAULT 'active',
    billing_cycle text NOT NULL DEFAULT 'monthly',
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    canceled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read own subscription"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "BackOffice users can read all subscriptions"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (is_backoffice_user(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_stripe_customers_updated_at
    BEFORE UPDATE ON public.stripe_customers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();