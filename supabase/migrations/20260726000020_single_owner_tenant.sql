-- An identity (user_id) may be the active OWNER of at most one tenant at a
-- time. Other roles (manager, supervisor, receptionist, staff) are
-- unrestricted across tenants — that's the legitimate multi-salon-staff
-- case (a freelance stylist or manager working across unrelated
-- businesses). Enforced at the DB level (not just in UI code) so every
-- current and future path that inserts/updates user_roles is covered.
create or replace function public.enforce_single_owner_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'owner' and coalesce(new.is_active, true) then
    if exists (
      select 1 from public.user_roles ur
      where ur.user_id = new.user_id
        and ur.role = 'owner'
        and coalesce(ur.is_active, true)
        and ur.tenant_id <> new.tenant_id
        and ur.id <> new.id
    ) then
      raise exception 'This account already owns another salon. Each owner can only own one active salon at a time.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_single_owner_tenant on public.user_roles;
create trigger trg_enforce_single_owner_tenant
  before insert or update on public.user_roles
  for each row
  execute function public.enforce_single_owner_tenant();
