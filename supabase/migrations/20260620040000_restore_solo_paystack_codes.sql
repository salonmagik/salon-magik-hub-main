-- One-time repair: the bug fixed in 20260620030000 wiped Solo's NGN/GHS Paystack
-- plan codes when a plan edit closed and recreated its active pricing rows.
-- Restore them from the most recent closed row that still has them.
update public.plan_pricing pp
set paystack_plan_code_monthly = prev.paystack_plan_code_monthly,
    paystack_plan_code_annual = prev.paystack_plan_code_annual
from (
  select distinct on (plan_id, currency)
    plan_id, currency, paystack_plan_code_monthly, paystack_plan_code_annual
  from public.plan_pricing
  where paystack_plan_code_monthly is not null
  order by plan_id, currency, valid_from desc
) prev
where pp.plan_id = prev.plan_id
  and pp.currency = prev.currency
  and pp.valid_until is null
  and pp.paystack_plan_code_monthly is null;
