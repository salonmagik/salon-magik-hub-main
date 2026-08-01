-- Solo is capped at 5 active services, products, packages, and vouchers.
-- Studio/Chain remain unlimited (NULL). max_services/max_products already
-- existed on plan_limits but were never enforced anywhere; this adds the
-- missing max_packages/max_vouchers columns and wires up real server-side
-- enforcement for all four, so the limit can't be bypassed by calling the
-- table insert directly.
alter table public.plan_limits
  add column if not exists max_packages integer,
  add column if not exists max_vouchers integer;

update public.plan_limits pl
set max_services = 5,
    max_products = 5,
    max_packages = 5,
    max_vouchers = 5
from public.plans p
where p.id = pl.plan_id
  and p.slug = 'solo';

create or replace function public.enforce_plan_resource_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max integer;
  v_count integer;
  v_limit_column text;
begin
  v_limit_column := case TG_TABLE_NAME
    when 'services' then 'max_services'
    when 'products' then 'max_products'
    when 'packages' then 'max_packages'
    when 'vouchers' then 'max_vouchers'
  end;

  if v_limit_column is null then
    return new;
  end if;

  -- Only rows created as 'active' count toward the limit — creating an
  -- inactive/draft row shouldn't be blocked by a full active quota.
  if new.status::text is distinct from 'active' then
    return new;
  end if;

  select t.plan::text into v_plan
  from public.tenants t
  where t.id = new.tenant_id;

  if v_plan is null then
    return new;
  end if;

  execute format(
    'select pl.%I from public.plan_limits pl join public.plans p on p.id = pl.plan_id where p.slug = $1',
    v_limit_column
  ) into v_max using v_plan;

  if v_max is null then
    return new;
  end if;

  execute format(
    'select count(*) from public.%I where tenant_id = $1 and status = ''active''',
    TG_TABLE_NAME
  ) into v_count using new.tenant_id;

  if v_count >= v_max then
    raise exception 'RESOURCE_LIMIT_REACHED: % limit of % active % reached for this plan',
      TG_TABLE_NAME, v_max, TG_TABLE_NAME
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_services_limit on public.services;
create trigger trg_enforce_services_limit
before insert on public.services
for each row execute function public.enforce_plan_resource_limit();

drop trigger if exists trg_enforce_products_limit on public.products;
create trigger trg_enforce_products_limit
before insert on public.products
for each row execute function public.enforce_plan_resource_limit();

drop trigger if exists trg_enforce_packages_limit on public.packages;
create trigger trg_enforce_packages_limit
before insert on public.packages
for each row execute function public.enforce_plan_resource_limit();

drop trigger if exists trg_enforce_vouchers_limit on public.vouchers;
create trigger trg_enforce_vouchers_limit
before insert on public.vouchers
for each row execute function public.enforce_plan_resource_limit();
