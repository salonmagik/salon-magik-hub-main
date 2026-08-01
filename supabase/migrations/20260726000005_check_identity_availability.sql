-- Centralized uniqueness check for the exclusive-access (waitlist) form and
-- signup: an email or phone may not be reused if it already belongs to an
-- active salon member (a user_roles row) or to a pending/invited waitlist lead.
--
-- Returns one of:
--   'tenant_email'      email already belongs to an active salon account
--   'tenant_phone'      phone already belongs to an active salon account
--   'waitlist_pending'  email/phone has a pending (not yet invited) request
--   'waitlist_invited'  email/phone has an invited request (may complete signup)
--   NULL                available
--
-- SECURITY DEFINER so it can read auth.users; execute is granted only to
-- service_role (the edge functions call it) to avoid identifier enumeration.
create or replace function public.check_identity_availability(
  p_email text,
  p_phone text
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_uid uuid;
  v_wl_status text;
begin
  -- Email belongs to an active salon member?
  if v_email is not null then
    select u.id into v_uid
    from auth.users u
    where lower(u.email) = v_email
    limit 1;

    if v_uid is not null and exists (
      select 1 from public.user_roles r
      where r.user_id = v_uid and coalesce(r.is_active, true)
    ) then
      return 'tenant_email';
    end if;
  end if;

  -- Phone belongs to an active salon member?
  if v_phone is not null then
    select pr.user_id into v_uid
    from public.profiles pr
    where pr.phone = v_phone
    limit 1;

    if v_uid is not null and exists (
      select 1 from public.user_roles r
      where r.user_id = v_uid and coalesce(r.is_active, true)
    ) then
      return 'tenant_phone';
    end if;
  end if;

  -- Already has a pending/invited exclusive-access request? (prefer 'invited'
  -- so an invited lead can still complete signup.)
  select w.status into v_wl_status
  from public.waitlist_leads w
  where w.status in ('pending', 'invited')
    and (
      (v_email is not null and lower(w.email) = v_email)
      or (v_phone is not null and w.phone = v_phone)
    )
  order by (w.status = 'invited') desc
  limit 1;

  if v_wl_status = 'invited' then
    return 'waitlist_invited';
  elsif v_wl_status = 'pending' then
    return 'waitlist_pending';
  end if;

  return null;
end;
$$;

revoke all on function public.check_identity_availability(text, text) from public, anon, authenticated;
grant execute on function public.check_identity_availability(text, text) to service_role;
