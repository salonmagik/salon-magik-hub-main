-- Step 8 of the payments-rails rebuild: real SMS credit pricing.
--
-- Previous pricing (CREDIT_PACKAGES in useCreditPurchase.tsx) was a
-- placeholder unrelated to Arkesel's real cost — e.g. NGN 3,500 for 50
-- credits is NGN 70/credit, while Arkesel's real transactional-SMS rate is
-- ~NGN 6.30/SMS even at their smallest published tier. This seeds the real
-- tier structure: bundle price points mirror Arkesel's own published
-- tiers (cheaper cost/SMS at higher volume), each carrying Arkesel's real
-- cost/SMS at that tier; credits granted are computed at read/purchase
-- time as bundle_price / (arkesel_cost_per_sms * margin_multiplier), so
-- editing the margin later recalculates every tier automatically instead
-- of needing every tier hand-edited.
--
-- NGN uses Arkesel's "transactional" rate (not "promotional") since
-- appointment reminders and OTPs are transactional messages, not
-- marketing. GHS has no such split in Arkesel's published pricing.
insert into public.platform_settings (key, value, description)
values (
  'sms_credit_pricing',
  jsonb_build_object(
    'margin_multiplier', 1.5,
    'low_balance_threshold_credits', 20,
    'tiers', jsonb_build_object(
      'NGN', jsonb_build_array(
        jsonb_build_object('bundle_price', 5000, 'arkesel_cost_per_sms', 6.30),
        jsonb_build_object('bundle_price', 10000, 'arkesel_cost_per_sms', 6.30),
        jsonb_build_object('bundle_price', 20000, 'arkesel_cost_per_sms', 6.30),
        jsonb_build_object('bundle_price', 50000, 'arkesel_cost_per_sms', 6.20),
        jsonb_build_object('bundle_price', 100000, 'arkesel_cost_per_sms', 6.20)
      ),
      'GHS', jsonb_build_array(
        jsonb_build_object('bundle_price', 20, 'arkesel_cost_per_sms', 0.0310),
        jsonb_build_object('bundle_price', 50, 'arkesel_cost_per_sms', 0.0300),
        jsonb_build_object('bundle_price', 100, 'arkesel_cost_per_sms', 0.0290),
        jsonb_build_object('bundle_price', 200, 'arkesel_cost_per_sms', 0.0280),
        jsonb_build_object('bundle_price', 500, 'arkesel_cost_per_sms', 0.0270)
      )
    )
  ),
  'Real SMS credit bundle pricing: Arkesel cost/SMS per tier (source of truth for credits granted) and the margin multiplier applied on top. Edit the margin here, not per-tier.'
)
on conflict (key) do nothing;

-- Tracks whether a tenant has already been alerted about a low SMS credit
-- balance, so the alert fires once per drop-below-threshold event instead
-- of on every single message sent while balance stays low. Cleared back to
-- null whenever the tenant buys more credits.
alter table public.communication_credits
  add column if not exists low_balance_alerted_at timestamptz;
