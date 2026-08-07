-- check_identity_availability's phone check previously only blocked reuse
-- while the matching account still held an ACTIVE user_roles row. That left
-- a free-trial abuse loophole: let a trial tenant go inactive/abandoned,
-- then sign up again with a new email but the same phone number, and the
-- check passed. Trials don't require a card (deliberate, to build trust),
-- so phone reuse is one of the few signals available to catch a repeat
-- signup by the same person.
--
-- This adds a second phone check, scoped specifically to past tenant
-- OWNERS (not staff, who may legitimately share a business phone line
-- across unrelated tenants) — if this phone was ever used to own a tenant
-- before, regardless of that tenant's current status, block the new
-- signup with an honest message (not "sign in", since there may be no
-- live account to sign into).
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
  -- Email already belongs to ANY existing account — email is globally
  -- unique in auth.users, so this is true regardless of whether the
  -- account has completed onboarding into an active salon role yet.
  if v_email is not null then
    if exists (
      select 1 from auth.users u where lower(u.email) = v_email
    ) then
      return 'tenant_email';
    end if;
  end if;

  -- Phone belongs to an active salon member? (profiles.phone is a contact
  -- field, not globally unique the way auth.users.email is — see
  -- auth-resolve-identifier's identity-separation comment — so this stays
  -- scoped to active salon members only.)
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

    -- Phone was ever used to OWN a tenant before, even if that tenant (or
    -- the owner's role on it) is no longer active. Scoped to 'owner' only
    -- so staff sharing a business line across tenants aren't caught here.
    if v_uid is not null and exists (
      select 1 from public.user_roles r
      where r.user_id = v_uid and r.role = 'owner'
    ) then
      return 'tenant_phone_trial_used';
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
