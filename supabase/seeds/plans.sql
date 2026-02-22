-- =============================================
-- Seed data for Plans System
-- =============================================
-- This file is idempotent and safe to run multiple times.
-- It will delete existing seed data and recreate it.

BEGIN;

-- Delete existing seed data (cascades to related tables)
DELETE FROM public.plans WHERE slug IN ('starter', 'professional', 'premium', 'enterprise');

-- Insert Plans
WITH inserted_plans AS (
  INSERT INTO public.plans (slug, name, description, display_order, is_active, is_recommended, trial_days)
  VALUES
    (
      'starter',
      'Starter',
      'Perfect for independent stylists and small salons just getting started',
      1,
      true,
      false,
      14
    ),
    (
      'professional',
      'Professional',
      'Ideal for growing salons with multiple staff members and locations',
      2,
      true,
      true, -- Recommended plan
      14
    ),
    (
      'premium',
      'Premium',
      'Advanced features for established salons with multiple locations',
      3,
      true,
      false,
      14
    ),
    (
      'enterprise',
      'Enterprise',
      'Complete solution for salon chains and franchises with unlimited scale',
      4,
      true,
      false,
      30 -- Longer trial for enterprise
    )
  RETURNING id, slug
)

-- Insert Plan Pricing (USD)
, inserted_pricing AS (
  INSERT INTO public.plan_pricing (plan_id, currency, monthly_price, annual_price, effective_monthly)
  SELECT
    id,
    'USD',
    CASE slug
      WHEN 'starter' THEN 29.00
      WHEN 'professional' THEN 79.00
      WHEN 'premium' THEN 149.00
      WHEN 'enterprise' THEN 299.00
    END,
    CASE slug
      WHEN 'starter' THEN 290.00      -- $24.17/mo (17% discount)
      WHEN 'professional' THEN 790.00 -- $65.83/mo (17% discount)
      WHEN 'premium' THEN 1490.00     -- $124.17/mo (17% discount)
      WHEN 'enterprise' THEN 2990.00  -- $249.17/mo (17% discount)
    END,
    CASE slug
      WHEN 'starter' THEN 24.17
      WHEN 'professional' THEN 65.83
      WHEN 'premium' THEN 124.17
      WHEN 'enterprise' THEN 249.17
    END
  FROM inserted_plans
  RETURNING plan_id
)

-- Insert Plan Limits
, inserted_limits AS (
  INSERT INTO public.plan_limits (
    plan_id,
    max_locations,
    max_staff,
    max_services,
    max_products,
    monthly_messages,
    features_enabled
  )
  SELECT
    id,
    CASE slug
      WHEN 'starter' THEN 1
      WHEN 'professional' THEN 3
      WHEN 'premium' THEN 10
      WHEN 'enterprise' THEN NULL -- Unlimited
    END,
    CASE slug
      WHEN 'starter' THEN 3
      WHEN 'professional' THEN 10
      WHEN 'premium' THEN 50
      WHEN 'enterprise' THEN NULL -- Unlimited
    END,
    CASE slug
      WHEN 'starter' THEN 25
      WHEN 'professional' THEN 100
      WHEN 'premium' THEN NULL -- Unlimited
      WHEN 'enterprise' THEN NULL -- Unlimited
    END,
    CASE slug
      WHEN 'starter' THEN 50
      WHEN 'professional' THEN 200
      WHEN 'premium' THEN NULL -- Unlimited
      WHEN 'enterprise' THEN NULL -- Unlimited
    END,
    CASE slug
      WHEN 'starter' THEN 100
      WHEN 'professional' THEN 500
      WHEN 'premium' THEN 2000
      WHEN 'enterprise' THEN 10000
    END,
    CASE slug
      WHEN 'starter' THEN jsonb_build_object(
        'online_booking', true,
        'client_portal', true,
        'basic_reporting', true,
        'email_notifications', true,
        'calendar_sync', false,
        'sms_notifications', false,
        'advanced_reporting', false,
        'api_access', false,
        'white_label', false,
        'priority_support', false,
        'custom_domain', false,
        'multi_location', false
      )
      WHEN 'professional' THEN jsonb_build_object(
        'online_booking', true,
        'client_portal', true,
        'basic_reporting', true,
        'email_notifications', true,
        'calendar_sync', true,
        'sms_notifications', true,
        'advanced_reporting', true,
        'api_access', false,
        'white_label', false,
        'priority_support', true,
        'custom_domain', false,
        'multi_location', true
      )
      WHEN 'premium' THEN jsonb_build_object(
        'online_booking', true,
        'client_portal', true,
        'basic_reporting', true,
        'email_notifications', true,
        'calendar_sync', true,
        'sms_notifications', true,
        'advanced_reporting', true,
        'api_access', true,
        'white_label', true,
        'priority_support', true,
        'custom_domain', true,
        'multi_location', true
      )
      WHEN 'enterprise' THEN jsonb_build_object(
        'online_booking', true,
        'client_portal', true,
        'basic_reporting', true,
        'email_notifications', true,
        'calendar_sync', true,
        'sms_notifications', true,
        'advanced_reporting', true,
        'api_access', true,
        'white_label', true,
        'priority_support', true,
        'custom_domain', true,
        'multi_location', true,
        'dedicated_support', true,
        'custom_integrations', true
      )
    END
  FROM inserted_plans
  RETURNING plan_id
)

-- Insert Plan Features (bullet points for pricing cards)
INSERT INTO public.plan_features (plan_id, feature_text, sort_order)
SELECT
  id,
  feature_text,
  sort_order
FROM inserted_plans
CROSS JOIN LATERAL (
  SELECT * FROM (
    VALUES
      -- Starter features
      ('starter', 'Up to 3 staff members', 1),
      ('starter', '1 location', 2),
      ('starter', 'Online booking widget', 3),
      ('starter', 'Basic reporting & analytics', 4),
      ('starter', '100 SMS messages/month', 5),
      
      -- Professional features
      ('professional', 'Up to 10 staff members', 1),
      ('professional', 'Up to 3 locations', 2),
      ('professional', 'Advanced reporting & analytics', 3),
      ('professional', 'Calendar sync (Google, Apple)', 4),
      ('professional', '500 SMS messages/month', 5),
      ('professional', 'Priority email support', 6),
      
      -- Premium features
      ('premium', 'Up to 50 staff members', 1),
      ('premium', 'Up to 10 locations', 2),
      ('premium', 'White-label branding', 3),
      ('premium', 'Custom domain support', 4),
      ('premium', 'API access', 5),
      ('premium', '2,000 SMS messages/month', 6),
      ('premium', 'Dedicated account manager', 7),
      
      -- Enterprise features
      ('enterprise', 'Unlimited staff & locations', 1),
      ('enterprise', 'Custom integrations', 2),
      ('enterprise', 'Advanced security & compliance', 3),
      ('enterprise', 'Dedicated support team', 4),
      ('enterprise', '10,000 SMS messages/month', 5),
      ('enterprise', 'SLA guarantee', 6),
      ('enterprise', 'Custom contract terms', 7)
  ) AS features(plan_slug, feature_text, sort_order)
  WHERE features.plan_slug = inserted_plans.slug
) AS plan_features_data;

COMMIT;

-- Verify the seed data
SELECT 
  p.slug,
  p.name,
  p.is_recommended,
  pp.monthly_price,
  pp.annual_price,
  pl.max_locations,
  pl.max_staff,
  COUNT(pf.id) as feature_count
FROM public.plans p
LEFT JOIN public.plan_pricing pp ON p.id = pp.plan_id
LEFT JOIN public.plan_limits pl ON p.id = pl.plan_id
LEFT JOIN public.plan_features pf ON p.id = pf.plan_id
WHERE p.slug IN ('starter', 'professional', 'premium', 'enterprise')
GROUP BY p.slug, p.name, p.is_recommended, pp.monthly_price, pp.annual_price, pl.max_locations, pl.max_staff
ORDER BY p.display_order;
