-- Waitlist leads only ever flip to 'converted' once they finish onboarding
-- and create a tenant. Someone who clicked their invite and created an
-- account but abandoned before finishing onboarding stays stuck at
-- 'invited' forever, with no visibility in backoffice. This RPC surfaces
-- that "signed up, not yet converted" cohort by matching invited leads
-- against real auth.users accounts.
create or replace function public.backoffice_list_waitlist_signups()
returns table (
  lead_id uuid,
  name text,
  email text,
  phone text,
  plan_interest text,
  invited_at timestamptz,
  signed_up_at timestamptz,
  user_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.backoffice_users bu
    where bu.user_id = auth.uid() and coalesce(bu.is_active, true)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    wl.id as lead_id,
    wl.name,
    wl.email,
    wl.phone,
    wl.plan_interest,
    wl.approved_at as invited_at,
    u.created_at as signed_up_at,
    u.id as user_id
  from public.waitlist_leads wl
  join auth.users u on lower(u.email) = lower(wl.email)
  where wl.status = 'invited'
  order by u.created_at desc;
end;
$$;

grant execute on function public.backoffice_list_waitlist_signups() to authenticated;
