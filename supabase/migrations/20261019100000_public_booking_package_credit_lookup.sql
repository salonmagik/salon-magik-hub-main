-- Phase 2 (public-booking self-book via package credit): the public
-- booking site has no way to read a customer's package entitlements.
-- customer_package_entitlements/_items are RLS-gated to tenant staff or an
-- *authenticated* customer (user_id = auth.uid()) -- but public-booking
-- resolves a returning customer anonymously via lookup_booking_customer_match
-- (same precedent as 20260807020000) well before, if ever, that customer
-- signs in with a password/OTP. Without a narrow accessor, entitlements
-- would silently read as empty for exactly the guest-identified case this
-- feature targets.
--
-- Mirrors lookup_booking_customer_match's shape: the caller already knows
-- (or has honestly resolved) p_customer_id, so this only returns the minimal
-- projection needed to decide whether to offer package-credit redemption for
-- a given service -- remaining count, package name, service id -- never the
-- entitlement row itself or anything else about the customer.

create or replace function public.list_customer_available_package_credits(
  p_tenant_id uuid,
  p_customer_id uuid
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
  from public.customer_package_entitlements pe
  join public.customer_package_entitlement_items pei on pei.entitlement_id = pe.id
  left join public.packages pkg on pkg.id = pe.package_id
  where pe.tenant_id = p_tenant_id
    and pe.customer_id = p_customer_id
    and pe.status = 'active'
    and (pe.expires_at is null or pe.expires_at > now())
    and pei.service_id is not null
    and pei.remaining_quantity > pei.reserved_quantity;
$$;

grant execute on function public.list_customer_available_package_credits(uuid, uuid) to anon, authenticated, service_role;
