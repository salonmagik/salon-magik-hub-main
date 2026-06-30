-- Plan prices were edited directly on Paystack's dashboard (the backoffice
-- "sync to Paystack" button wasn't visible, so there was no other way to push
-- a price change). Our plan_pricing table never got updated to match, so
-- every checkout using a plan code failed with "Invalid Amount Sent" —
-- Paystack rejects /transaction/initialize when the supplied amount doesn't
-- match the Plan object's actual configured amount. Paystack is now the
-- source of truth for what's actually live; resyncing our DB to match it
-- (confirmed against the Paystack test dashboard directly, not assumed).
update public.plan_pricing pp
set monthly_price = v.monthly_price,
    annual_price = v.annual_price
from (
  values
    ('solo',   'GHS', 120::numeric,   1200::numeric),
    ('studio', 'GHS', 280::numeric,   3500::numeric),
    ('chain',  'GHS', 400::numeric,   5000::numeric),
    ('solo',   'NGN', 7000::numeric,   90000::numeric),
    ('studio', 'NGN', 20000::numeric,  200000::numeric),
    ('chain',  'NGN', 40000::numeric,  500000::numeric)
) as v(slug, currency, monthly_price, annual_price)
join public.plans p on p.slug = v.slug
where pp.plan_id = p.id
  and pp.currency = v.currency
  and pp.valid_until is null;
