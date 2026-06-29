-- Set Paystack TEST-mode subscription plan codes for solo/studio/chain plans
-- across NGN (Nigeria) and GHS (Ghana) pricing.
-- These codes are scoped to Paystack TEST mode and are only valid against
-- sk_test_ keys — i.e. the dev project. Do NOT run this against staging/prod.
-- Matches the currently-active pricing row per plan/currency (valid_until is null),
-- the same row create-checkout-session reads from.

update public.plan_pricing pp
set paystack_plan_code_monthly = v.monthly_code,
    paystack_plan_code_annual = v.annual_code
from (
  values
    ('solo',   'NGN', 'PLN_7qwq05bqsna9se1', 'PLN_5n8d5esdqwrw1rz'),
    ('studio', 'NGN', 'PLN_sesyvfzhxootwqt', 'PLN_sgdwe3sriwnzla9'),
    ('chain',  'NGN', 'PLN_8kr4mhlr9lfq4sr', 'PLN_nxna4yci1spnrpr'),
    ('solo',   'GHS', 'PLN_iqqsn13asevie34', 'PLN_oopddn2c0dfgq0s'),
    ('studio', 'GHS', 'PLN_1s0sv01m4fixg53', 'PLN_1v6zdalcdb2onai'),
    ('chain',  'GHS', 'PLN_dqjntjo0t00qnob', 'PLN_6m0akvw8b6gr4rz')
) as v(slug, currency, monthly_code, annual_code)
join public.plans p on p.slug = v.slug
where pp.plan_id = p.id
  and pp.currency = v.currency
  and pp.valid_until is null;
