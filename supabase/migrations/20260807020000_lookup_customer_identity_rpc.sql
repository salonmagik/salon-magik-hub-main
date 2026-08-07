-- public.customers has never had an anon-read RLS policy (same class of gap
-- as vouchers, fixed in 20260807010000). Three call sites in public-booking
-- already query it directly as the anonymous checkout customer expecting a
-- match — BookingWizard's purse-balance lookup, VoucherInput's private-
-- voucher-ownership check, and the new gift-recipient identity-mixup check
-- — all of which have therefore always silently returned zero rows for
-- anon (purse balance stuck at 0, private-voucher/claimed-voucher checks
-- unenforceable for guests).
--
-- Rather than grant anon a broad SELECT policy on customers (a table with
-- real PII — full_name, email, phone, addresses — which would let anyone
-- with the anon key dump a tenant's whole customer list via a raw REST
-- call), this exposes only the minimal projection each of those call sites
-- actually needs: whether a given email/phone matches an existing customer
-- of this tenant, that customer's id, and their first name only.

begin;

create or replace function public.lookup_booking_customer_match(
  p_tenant_id uuid,
  p_email text default null,
  p_phone text default null
)
returns table (
  customer_id uuid,
  first_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, nullif(split_part(coalesce(c.full_name, ''), ' ', 1), '')
  from public.customers c
  where c.tenant_id = p_tenant_id
    and (
      (p_email is not null and p_email <> '' and lower(c.email) = lower(p_email))
      or (p_phone is not null and p_phone <> '' and c.phone = p_phone)
    )
  limit 1;
$$;

grant execute on function public.lookup_booking_customer_match(uuid, text, text) to anon, authenticated;

commit;
