-- Set Paystack subscription plan codes for solo/studio/chain plans
-- across NGN (Nigeria) and GHS (Ghana) pricing.
-- Matches the currently-active pricing row per plan/currency (valid_until is null),
-- the same row create-checkout-session reads from.

update public.plan_pricing pp
set paystack_plan_code_monthly = v.monthly_code,
    paystack_plan_code_annual = v.annual_code
from (
  values
    ('solo',   'NGN', 'PLN_b765b6zpdtd2cr6', 'PLN_kjzhfcxrw383sgp'),
    ('studio', 'NGN', 'PLN_i60ex0j5t2ief0y', 'PLN_vnwrjcm3y1jpvw4'),
    ('chain',  'NGN', 'PLN_gyvxsgtzbgw0b0z', 'PLN_rpkndd46s6xu9n3'),
    ('solo',   'GHS', 'PLN_kutgl6jkcoym2u0', 'PLN_fxo60urjygkkxgl'),
    ('studio', 'GHS', 'PLN_33u7lhy5yeqfh48', 'PLN_lgrbx7oxh31ai5q'),
    ('chain',  'GHS', 'PLN_36knf7nh8kk9keo', 'PLN_do01nq4uwc24r80')
) as v(slug, currency, monthly_code, annual_code)
join public.plans p on p.slug = v.slug
where pp.plan_id = p.id
  and pp.currency = v.currency
  and pp.valid_until is null;
