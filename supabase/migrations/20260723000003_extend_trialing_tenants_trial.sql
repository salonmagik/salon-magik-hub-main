-- RPC called by the backoffice when the global default trial days is changed.
-- Resets trial_ends_at for every currently-trialing tenant to created_at + p_days,
-- so the full new period applies from each tenant's original signup date.
create or replace function public.extend_trialing_tenants_trial(p_days int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tenants
  set trial_ends_at = created_at + (p_days || ' days')::interval
  where subscription_status = 'trialing';
$$;

-- Only backoffice users can call this.
revoke execute on function public.extend_trialing_tenants_trial(int) from public, anon, authenticated;
grant execute on function public.extend_trialing_tenants_trial(int) to authenticated;
