-- customers.visit_count / last_visit_at have existed since the original
-- schema but were NEVER written anywhere in the codebase — every customer
-- sits at visit_count=0, last_visit_at=null forever, regardless of how many
-- appointments they've completed. This silently breaks: the "X visits" shown
-- on customer cards/detail modals, the Regular segment (visit_count >= 5,
-- always false), the Lapsed segment (last_visit_at < 45 days, always false
-- since last_visit_at is always null), and the messaging "no appointment in
-- 30/60 days" audiences (always match everyone, since last_visit_at is never
-- set).
--
-- Fix: a trigger that increments visit_count + sets last_visit_at whenever an
-- appointment transitions TO 'completed' (a trigger, not scattered
-- application-code calls, so it fires regardless of which UI/API path
-- completes the appointment). Plus a one-time backfill from existing
-- completed-appointment history so current data is correct immediately,
-- not just going forward.

create or replace function public.update_customer_visit_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.customers
    set
      visit_count = visit_count + 1,
      last_visit_at = greatest(coalesce(new.actual_end, new.scheduled_end, now()), coalesce(last_visit_at, 'epoch'::timestamptz))
    where id = new.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_update_customer_visit_stats on public.appointments;
create trigger trg_update_customer_visit_stats
  after update on public.appointments
  for each row
  execute function public.update_customer_visit_stats();

-- One-time backfill: recompute visit_count / last_visit_at for every
-- customer from their actual completed-appointment history.
with visit_stats as (
  select
    customer_id,
    count(*) as completed_count,
    max(coalesce(actual_end, scheduled_end, created_at)) as last_visit
  from public.appointments
  where status = 'completed'
  group by customer_id
)
update public.customers c
set
  visit_count = vs.completed_count,
  last_visit_at = vs.last_visit
from visit_stats vs
where vs.customer_id = c.id;
