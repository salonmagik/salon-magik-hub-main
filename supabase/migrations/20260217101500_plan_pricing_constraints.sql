-- Constraint layer for BackOffice Plans/Pricing management
-- Milestone 1:
-- 1) Cap plans to 4 total rows
-- 2) Enforce case-insensitive uniqueness on plan name + slug
-- 3) Enforce one active pricing row per (plan, currency)
-- 4) Expose plans without active pricing for deterministic UI filtering

create or replace function public.enforce_plan_cap()
returns trigger
language plpgsql
as $$
declare
  current_count integer;
begin
  select count(*) into current_count from public.plans;
  if current_count >= 4 then
    raise exception 'PLAN_CAP_REACHED'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_plan_cap on public.plans;
create trigger trg_enforce_plan_cap
before insert on public.plans
for each row
execute function public.enforce_plan_cap();

create unique index if not exists idx_plans_name_lower_unique
  on public.plans (lower(name));

create unique index if not exists idx_plans_slug_lower_unique
  on public.plans (lower(slug));

create unique index if not exists idx_plan_pricing_active_unique
  on public.plan_pricing (plan_id, currency)
  where valid_until is null;

create unique index if not exists idx_plans_single_recommended_true
  on public.plans ((is_recommended))
  where is_recommended;

create or replace view public.v_plans_without_active_pricing as
select p.*
from public.plans p
where not exists (
  select 1
  from public.plan_pricing pp
  where pp.plan_id = p.id
    and pp.valid_until is null
);

grant select on public.v_plans_without_active_pricing to authenticated;
