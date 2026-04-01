create or replace function public.normalize_customer_email(value text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(value, ''))), '')
$$;

create or replace function public.normalize_customer_phone(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(value, ''), '[^0-9]+', '', 'g'), '')
$$;

create or replace function public.prevent_duplicate_customers_per_tenant()
returns trigger
language plpgsql
as $$
declare
  conflicting_customer_name text;
begin
  if new.tenant_id is null then
    return new;
  end if;

  if public.normalize_customer_email(new.email) is not null then
    select full_name
      into conflicting_customer_name
    from public.customers
    where tenant_id = new.tenant_id
      and id <> coalesce(new.id, gen_random_uuid())
      and public.normalize_customer_email(email) = public.normalize_customer_email(new.email)
    limit 1;

    if conflicting_customer_name is not null then
      raise exception '% already uses this customer email address.', conflicting_customer_name
        using errcode = '23505';
    end if;
  end if;

  if public.normalize_customer_phone(new.phone) is not null then
    select full_name
      into conflicting_customer_name
    from public.customers
    where tenant_id = new.tenant_id
      and id <> coalesce(new.id, gen_random_uuid())
      and public.normalize_customer_phone(phone) = public.normalize_customer_phone(new.phone)
    limit 1;

    if conflicting_customer_name is not null then
      raise exception '% already uses this customer phone number.', conflicting_customer_name
        using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_customers_per_tenant on public.customers;
create trigger trg_prevent_duplicate_customers_per_tenant
before insert or update on public.customers
for each row
execute function public.prevent_duplicate_customers_per_tenant();

create index if not exists idx_customers_tenant_normalized_email
  on public.customers (tenant_id, public.normalize_customer_email(email));

create index if not exists idx_customers_tenant_normalized_phone
  on public.customers (tenant_id, public.normalize_customer_phone(phone));
