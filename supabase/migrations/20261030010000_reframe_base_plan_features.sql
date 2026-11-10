-- Keep the public pricing claims in the backoffice-managed plan_features table.
-- The public marketing pages read these rows; they should not own a second
-- hardcoded copy of the base subscription feature list.
do $$
declare
  v_solo_id uuid;
begin
  -- USD was a legacy fallback. Ghana and Nigeria are the current launch
  -- markets, so it must not be offered in their subscription selectors.
  update public.market_country_currency
  set is_enabled = false
  where currency_code = 'USD'
    and country_code in ('GH', 'NG');

  select id into v_solo_id from public.plans where slug = 'solo' limit 1;

  if v_solo_id is null then
    return;
  end if;

  delete from public.plan_features where plan_id = v_solo_id;

  insert into public.plan_features (plan_id, feature_text, sort_order) values
    (v_solo_id, 'Unlimited services, products, packages, and vouchers', 0),
    (v_solo_id, 'Unlimited email marketing', 1),
    (v_solo_id, 'Unlimited email appointment reminders', 2),
    (v_solo_id, 'Complimentary SMS allowances for reminders and marketing', 3),
    (v_solo_id, 'Appointments, payments, booking page, and reports', 4),
    (v_solo_id, 'Add locations and team seats as your salon grows', 5),
    (v_solo_id, 'Paid themes and Staff Operations available as add-ons', 6);
end $$;
