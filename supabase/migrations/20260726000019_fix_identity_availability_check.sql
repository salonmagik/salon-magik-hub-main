-- Fixes two gaps in check_identity_availability:
--
-- 1. The email check previously only flagged a conflict when the matching
--    auth.users row also had an ACTIVE user_roles entry. A user who signed
--    up but never finished onboarding into a role (no tenant/no owner role
--    yet) could then submit a waitlist request with the same email, which
--    then hit Supabase's own "account already exists" wall at eventual
--    signup — after already going through admin review. Since email is
--    globally unique in auth.users regardless of role status, any existing
--    auth.users row for that email should block a new request.
--
-- 2. This is a data-integrity gate, not a nice-to-have — callers (see
--    submit-waitlist) must fail closed on an RPC error rather than silently
--    proceeding. See submit-waitlist/index.ts for the corresponding fix.
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
