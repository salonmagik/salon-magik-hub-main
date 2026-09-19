-- Scheduled SMS reminders must consume the same communication credits as
-- salon-sent SMS. Reserve credits atomically before calling Arkesel so two
-- overlapping cron invocations cannot both spend the same balance.

create or replace function public.reserve_communication_credits(
  p_tenant_id uuid,
  p_amount integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    return false;
  end if;

  update public.communication_credits
  set balance = balance - p_amount,
      updated_at = now()
  where tenant_id = p_tenant_id
    and balance >= p_amount;

  return found;
end;
$$;

create or replace function public.restore_communication_credits(
  p_tenant_id uuid,
  p_amount integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    return false;
  end if;

  update public.communication_credits
  set balance = balance + p_amount,
      updated_at = now()
  where tenant_id = p_tenant_id;

  return found;
end;
$$;

revoke execute on function public.reserve_communication_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function public.restore_communication_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_communication_credits(uuid, integer) to service_role;
grant execute on function public.restore_communication_credits(uuid, integer) to service_role;
