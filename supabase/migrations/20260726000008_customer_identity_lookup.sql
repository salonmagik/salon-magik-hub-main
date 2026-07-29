-- #4a: identity-first add-customer flow.
--
-- Adds canonical-ish profile fields to customers (gender, country, address,
-- city — birthday already existed from the birthday-messages feature) and a
-- lookup RPC so a salon can check, by email/phone, whether a person is
-- already a Salon Magik customer elsewhere BEFORE typing out their profile.
--
-- Privacy: the lookup only ever returns identity/profile fields (name,
-- gender, birthday, country, address, city) from the most recently updated
-- matching row across ALL tenants — never tenant-specific data (notes,
-- balance, status, which other salon they use, VIP flag).

alter table public.customers
  add column if not exists gender text,
  add column if not exists country text,
  add column if not exists address text,
  add column if not exists city text;

create or replace function public.lookup_customer_identity(
  p_tenant_id uuid,
  p_email text,
  p_phone text
)
returns table (
  exists_in_tenant boolean,
  found_elsewhere boolean,
  full_name text,
  gender text,
  birthday date,
  country text,
  address text,
  city text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := public.normalize_customer_email(p_email);
  v_phone text := public.normalize_customer_phone(p_phone);
  v_actor uuid := auth.uid();
  v_tenant_match boolean := false;
  v_match record;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1 from public.user_roles r
    where r.user_id = v_actor and r.tenant_id = p_tenant_id and coalesce(r.is_active, true)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if v_email is null and v_phone is null then
    return query select false, false, null::text, null::text, null::date, null::text, null::text, null::text;
    return;
  end if;

  select true into v_tenant_match
  from public.customers c
  where c.tenant_id = p_tenant_id
    and c.status <> 'deleted'
    and (
      (v_email is not null and public.normalize_customer_email(c.email) = v_email)
      or (v_phone is not null and public.normalize_customer_phone(c.phone) = v_phone)
    )
  limit 1;

  select c.full_name, c.gender, c.birthday, c.country, c.address, c.city
  into v_match
  from public.customers c
  where c.status <> 'deleted'
    and (
      (v_email is not null and public.normalize_customer_email(c.email) = v_email)
      or (v_phone is not null and public.normalize_customer_phone(c.phone) = v_phone)
    )
  order by c.updated_at desc
  limit 1;

  return query select
    coalesce(v_tenant_match, false),
    (v_match.full_name is not null),
    v_match.full_name,
    v_match.gender,
    v_match.birthday,
    v_match.country,
    v_match.address,
    v_match.city;
end;
$$;

grant execute on function public.lookup_customer_identity(uuid, text, text) to authenticated;
