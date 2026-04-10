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

  if coalesce(new.status, 'active') = 'deleted' then
    return new;
  end if;

  if public.normalize_customer_email(new.email) is not null then
    select full_name
      into conflicting_customer_name
    from public.customers
    where tenant_id = new.tenant_id
      and id <> new.id
      and coalesce(status, 'active') <> 'deleted'
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
      and id <> new.id
      and coalesce(status, 'active') <> 'deleted'
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
