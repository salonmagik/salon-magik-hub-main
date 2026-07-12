-- Revert 20260629040000: that migration overwrote plan_pricing with
-- Paystack's STALE dashboard amounts, on a mistaken assumption about which
-- side was current. The backoffice-edited prices were actually the correct,
-- up-to-date ones — Paystack never got the update because the backoffice
-- "sync to Paystack" button wasn't visible. Restoring the original
-- (correct) local values; a follow-up will push these to Paystack instead.
update public.plan_pricing pp
set monthly_price = v.monthly_price,
    annual_price = v.annual_price
from (
  values
    ('solo',   'GHS', 95::numeric,     1048.8::numeric),
    ('studio', 'GHS', 250::numeric,    2820::numeric),
    ('chain',  'GHS', 400::numeric,    4512::numeric),
    ('solo',   'NGN', 12000::numeric,  132480::numeric),
    ('studio', 'NGN', 22000::numeric,  248160::numeric),
    ('chain',  'NGN', 43000::numeric,  485040::numeric)
) as v(slug, currency, monthly_price, annual_price)
join public.plans p on p.slug = v.slug
where pp.plan_id = p.id
  and pp.currency = v.currency
  and pp.valid_until is null;
