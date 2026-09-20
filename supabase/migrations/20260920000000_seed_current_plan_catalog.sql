-- Keep a fresh environment usable for the current Solo/Studio/Chain product.
-- The plan rows were added in an earlier migration, but pricing and limits had
-- only been populated manually in the long-lived development database. A new
-- staging database therefore showed zero prices and no resource entitlements.

do $$
declare
  v_solo uuid;
  v_studio uuid;
  v_chain uuid;
begin
  select id into v_solo from public.plans where slug = 'solo';
  select id into v_studio from public.plans where slug = 'studio';
  select id into v_chain from public.plans where slug = 'chain';

  if v_solo is null or v_studio is null or v_chain is null then
    raise exception 'Current plan catalog is incomplete';
  end if;

  insert into public.plan_limits (
    plan_id, max_locations, max_staff, max_services, max_products,
    max_packages, max_vouchers, monthly_messages, features_enabled
  ) values
    (v_solo,   1,  3, 5,    5,    5,    5,    20,  jsonb_build_object('online_booking', true, 'client_portal', true, 'email_notifications', true, 'sms_notifications', true)),
    (v_studio, 1,  6, null, null, null, null, 50,  jsonb_build_object('online_booking', true, 'client_portal', true, 'email_notifications', true, 'sms_notifications', true, 'staff_roles', true, 'staff_reports', true)),
    (v_chain,  1, 12, null, null, null, null, 200, jsonb_build_object('online_booking', true, 'client_portal', true, 'email_notifications', true, 'sms_notifications', true, 'staff_roles', true, 'staff_reports', true, 'multi_location', true))
  on conflict (plan_id) do update set
    max_locations = excluded.max_locations,
    max_staff = excluded.max_staff,
    max_services = excluded.max_services,
    max_products = excluded.max_products,
    max_packages = excluded.max_packages,
    max_vouchers = excluded.max_vouchers,
    monthly_messages = excluded.monthly_messages,
    features_enabled = excluded.features_enabled;

  -- Prices are the current product values. Insert only when a currency has no
  -- active row so existing backoffice-managed price history is preserved.
  insert into public.plan_pricing (
    plan_id, currency, monthly_price, annual_price, effective_monthly,
    paystack_plan_code_monthly, paystack_plan_code_annual
  )
  select * from (values
    (v_solo,   'GHS', 95::numeric,    1048.8::numeric, 87.4::numeric,  'PLN_kutgl6jkcoym2u0', 'PLN_fxo60urjygkkxgl'),
    (v_studio, 'GHS', 250::numeric,   2820::numeric,   235::numeric,    'PLN_33u7lhy5yeqfh48', 'PLN_lgrbx7oxh31ai5q'),
    (v_chain,  'GHS', 400::numeric,   4512::numeric,   376::numeric,    'PLN_36knf7nh8kk9keo', 'PLN_do01nq4uwc24r80'),
    (v_solo,   'NGN', 12000::numeric, 132480::numeric, 11040::numeric,  'PLN_b765b6zpdtd2cr6', 'PLN_kjzhfcxrw383sgp'),
    (v_studio, 'NGN', 22000::numeric, 248160::numeric, 20680::numeric,  'PLN_i60ex0j5t2ief0y', 'PLN_vnwrjcm3y1jpvw4'),
    (v_chain,  'NGN', 43000::numeric, 485040::numeric, 40420::numeric,  'PLN_gyvxsgtzbgw0b0z', 'PLN_rpkndd46s6xu9n3')
  ) as p(plan_id, currency, monthly_price, annual_price, effective_monthly, paystack_plan_code_monthly, paystack_plan_code_annual)
  where not exists (
    select 1 from public.plan_pricing current
    where current.plan_id = p.plan_id
      and current.currency = p.currency
      and current.valid_until is null
  );
end $$;
