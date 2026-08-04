-- No code path (onboarding, backoffice-add-tenant-owner) has ever set
-- tenants.slug on creation, yet public-booking's entire storefront
-- routing (subdomain -> slug lookup, see slugResolution.ts) depends on
-- it — a tenant with a null slug has no working public booking page at
-- all. A handful of tenants (created directly via SQL) happen to have
-- one; every self-serve-onboarded tenant does not. Generate it
-- server-side on insert so every creation path gets one automatically,
-- and backfill existing null-slug tenants.
create or replace function public.generate_tenant_slug(base_name text)
returns text
language plpgsql
as $function$
declare
  base_slug text;
  candidate text;
  suffix int := 1;
begin
  base_slug := lower(regexp_replace(trim(coalesce(base_name, '')), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'salon';
  end if;

  candidate := base_slug;
  while exists (select 1 from public.tenants where slug = candidate) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  return candidate;
end;
$function$;

create or replace function public.set_tenant_slug()
returns trigger
language plpgsql
as $function$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.generate_tenant_slug(new.name);
  end if;
  return new;
end;
$function$;

drop trigger if exists trigger_set_tenant_slug on public.tenants;
create trigger trigger_set_tenant_slug
before insert on public.tenants
for each row execute function public.set_tenant_slug();

do $$
declare
  r record;
begin
  for r in select id, name from public.tenants where slug is null or slug = '' loop
    update public.tenants
    set slug = public.generate_tenant_slug(name)
    where id = r.id;
  end loop;
end $$;
