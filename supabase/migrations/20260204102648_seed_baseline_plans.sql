-- The three base plans (Solo/Studio/Chain) were only ever inserted directly
-- against dev, never through a migration — every migration since that
-- references public.plans by slug (plan_features, plan_pricing, plan_limits,
-- etc.) silently assumed the rows already existed. That's true on dev, but
-- a from-scratch environment (staging, a future prod, disaster recovery)
-- has an empty plans table and every one of those downstream migrations
-- fails on a null plan_id lookup. Seed idempotently so this environment
-- catches up and any future one never hits this.
insert into public.plans (slug, name, description, display_order, is_active, is_recommended, trial_days)
values
  ('solo', 'Solo', 'Perfect for business owners who run the show solo but also want to differentiate how they serve their customers.', 1, true, false, 30),
  ('studio', 'Studio', 'For salons offering multiple specialized services in a studio.', 2, true, true, 30),
  ('chain', 'Chain', 'For salons with multiple locations and nuances', 3, true, false, 30)
on conflict (slug) do nothing;
