-- Backoffice visibility into signups worth a human look. Two signals:
--  1. blocked_phone_reuse — a signup was rejected outright because the
--     phone previously owned a tenant (logged by check_identity_availability
--     as of the prior migration).
--  2. shared_signup_ip — signups that WEREN'T blocked (different phone,
--     different email each time) but whose phone-verification OTP was
--     requested from the same IP as another tenant's owner. Not auto-blocked
--     (shared IPs are common and legitimate — office wifi, family, etc.) but
--     worth a look when the same IP keeps producing new trial tenants.
create or replace function public.get_flagged_signups()
returns table (
  flag_type text,
  detected_at timestamptz,
  phone_last4 text,
  attempted_email text,
  ip_address text,
  tenant_id uuid,
  tenant_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_backoffice_user(auth.uid()) then
    raise exception 'BACKOFFICE_ACCESS_REQUIRED';
  end if;

  return query
  (
    select
      'blocked_phone_reuse'::text,
      al.created_at,
      al.metadata->>'phone_last4',
      al.metadata->>'attempted_email',
      null::text,
      ur.tenant_id,
      t.name
    from public.audit_logs al
    left join public.user_roles ur on ur.user_id = al.entity_id and ur.role = 'owner'
    left join public.tenants t on t.id = ur.tenant_id
    where al.action = 'signup_blocked_phone_reuse'
    order by al.created_at desc
    limit 100
  )
  union all
  (
    select
      'shared_signup_ip'::text,
      pot.created_at,
      right(pot.phone, 4),
      null::text,
      pot.ip_address,
      t.id,
      t.name
    from public.phone_otp_tokens pot
    join public.profiles pr on pr.phone = pot.phone
    join public.user_roles ur on ur.user_id = pr.user_id and ur.role = 'owner'
    join public.tenants t on t.id = ur.tenant_id
    where pot.user_id is null
      and pot.ip_address is not null
      and pot.ip_address in (
        select pot2.ip_address
        from public.phone_otp_tokens pot2
        join public.profiles pr2 on pr2.phone = pot2.phone
        join public.user_roles ur2 on ur2.user_id = pr2.user_id and ur2.role = 'owner'
        where pot2.user_id is null and pot2.ip_address is not null
        group by pot2.ip_address
        having count(distinct ur2.tenant_id) > 1
      )
    order by pot.created_at desc
    limit 100
  );
end;
$$;

grant execute on function public.get_flagged_signups() to authenticated;
