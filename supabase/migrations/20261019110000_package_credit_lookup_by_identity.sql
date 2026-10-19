-- list_customer_available_package_credits (20261019100000) took a raw
-- p_customer_id, trusting whatever the browser already held after
-- lookup_booking_customer_match resolved it client-side. That makes the
-- customer_id itself a bearer credential for reading someone's package
-- balance: anyone who obtained a customer's UUID by any means (not hard --
-- it's unauthenticated-readable in plenty of other response payloads this
-- app already returns) could query their remaining sessions, with no proof
-- they are that customer.
--
-- lookup_booking_customer_match (20260807020000) already solved exactly
-- this problem for the identical anon-identification need: it accepts
-- email/phone, not an id, and resolves the customer server-side -- the
-- proof of "this is genuinely that customer" is knowing their contact
-- details, the same bar already required to identify them for prefill in
-- the first place. Re-shape this RPC to the same pattern instead of
-- inventing a second, weaker one.

drop function if exists public.list_customer_available_package_credits(uuid, uuid);

create or replace function public.list_customer_available_package_credits(
  p_tenant_id uuid,
  p_email text default null,
  p_phone text default null
)
returns table (
  entitlement_id uuid,
  entitlement_item_id uuid,
  service_id uuid,
  package_name text,
  remaining integer,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pe.id,
    pei.id,
    pei.service_id,
    coalesce(pkg.name, 'Package'),
    (pei.remaining_quantity - pei.reserved_quantity)::integer,
    pe.expires_at
  from public.customers c
  join public.customer_package_entitlements pe
    on pe.tenant_id = c.tenant_id and pe.customer_id = c.id
  join public.customer_package_entitlement_items pei on pei.entitlement_id = pe.id
  left join public.packages pkg on pkg.id = pe.package_id
  where c.tenant_id = p_tenant_id
    and (
      (p_email is not null and p_email <> '' and lower(c.email) = lower(p_email))
      or (p_phone is not null and p_phone <> '' and c.phone = p_phone)
    )
    and pe.status = 'active'
    and (pe.expires_at is null or pe.expires_at > now())
    and pei.service_id is not null
    and pei.remaining_quantity > pei.reserved_quantity
  limit 50;
$$;

grant execute on function public.list_customer_available_package_credits(uuid, text, text) to anon, authenticated, service_role;
