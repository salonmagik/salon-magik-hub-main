-- Blocked trial-abuse phone-reuse attempts (see 20260805160000) were
-- previously invisible — the signup just got a 409 and nothing was
-- recorded, so staff had no way to see the pattern or size of the abuse
-- attempts. Logs to audit_logs, the same table the rest of the platform
-- already uses for its activity trail, so a backoffice view can surface it
-- without a new table.
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
  if v_email is not null then
    if exists (
      select 1 from auth.users u where lower(u.email) = v_email
    ) then
      return 'tenant_email';
    end if;
  end if;

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

    if v_uid is not null and exists (
      select 1 from public.user_roles r
      where r.user_id = v_uid and r.role = 'owner'
    ) then
      insert into public.audit_logs (action, entity_type, entity_id, metadata)
      values (
        'signup_blocked_phone_reuse',
        'auth_attempt',
        v_uid,
        jsonb_build_object(
          'phone_last4', right(v_phone, 4),
          'attempted_email', v_email
        )
      );
      return 'tenant_phone_trial_used';
    end if;
  end if;

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
