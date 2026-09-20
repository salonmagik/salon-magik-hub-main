-- Branch wallets may operate in the branch's settlement currency when a chain
-- spans Nigeria and Ghana. The central/unassigned wallet keeps the tenant
-- currency for legacy and unassigned funds.

create or replace function public.validate_salon_wallet_currency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_currency text;
  v_expected_currency text;
  v_location_tenant_id uuid;
  v_location_country text;
begin
  select t.currency
    into v_tenant_currency
  from public.tenants t
  where t.id = new.tenant_id;

  if v_tenant_currency is null then
    raise exception 'Tenant % not found for salon wallet', new.tenant_id;
  end if;

  v_expected_currency := v_tenant_currency;

  if new.location_id is not null then
    select l.tenant_id, upper(trim(l.country))
      into v_location_tenant_id, v_location_country
    from public.locations l
    where l.id = new.location_id;

    if v_location_tenant_id is null or v_location_tenant_id <> new.tenant_id then
      raise exception 'Salon wallet location does not belong to tenant %', new.tenant_id;
    end if;

    v_expected_currency := case v_location_country
      when 'GH' then 'GHS'
      when 'GHANA' then 'GHS'
      when 'NG' then 'NGN'
      when 'NIGERIA' then 'NGN'
      else v_tenant_currency
    end;
  end if;

  if upper(new.currency) <> upper(v_expected_currency) then
    raise exception 'salon_wallets.currency (%) must match the settlement currency (%) for tenant %, location %',
      new.currency, v_expected_currency, new.tenant_id, new.location_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_validate_salon_wallet_currency on public.salon_wallets;
create trigger trigger_validate_salon_wallet_currency
  before insert or update of currency, tenant_id, location_id on public.salon_wallets
  for each row execute function public.validate_salon_wallet_currency();

comment on function public.validate_salon_wallet_currency() is
  'Validates central wallets against tenant currency and branch wallets against their branch country currency.';

-- Existing zero-balance branch wallets are safe to align immediately. A
-- non-zero mismatched wallet is left untouched so no amount is relabelled or
-- silently converted; it requires an explicit operational reconciliation.
update public.salon_wallets sw
set currency = case upper(trim(l.country))
  when 'GH' then 'GHS'
  when 'GHANA' then 'GHS'
  when 'NG' then 'NGN'
  when 'NIGERIA' then 'NGN'
  else sw.currency
end,
updated_at = now()
from public.locations l
where sw.location_id = l.id
  and coalesce(sw.balance, 0) = 0
  and upper(sw.currency) <> upper(case upper(trim(l.country))
    when 'GH' then 'GHS'
    when 'GHANA' then 'GHS'
    when 'NG' then 'NGN'
    when 'NIGERIA' then 'NGN'
    else sw.currency
  end);
