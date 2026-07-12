-- Auto-sync tenants.payment_setup_status when payout destinations change.
-- "ready" = at least one destination exists for the tenant.
-- "pending_bank_account" = no destinations.

create or replace function sync_tenant_payment_setup_status()
returns trigger
language plpgsql
security definer
as $$
declare
  v_tenant_id uuid;
  v_has_destination boolean;
begin
  v_tenant_id := coalesce(new.tenant_id, old.tenant_id);

  select exists (
    select 1 from public.salon_payout_destinations
    where tenant_id = v_tenant_id
  ) into v_has_destination;

  update public.tenants
  set payment_setup_status = case when v_has_destination then 'ready' else 'pending_bank_account' end
  where id = v_tenant_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_payment_setup_status on public.salon_payout_destinations;
create trigger trg_sync_payment_setup_status
after insert or update or delete on public.salon_payout_destinations
for each row execute function sync_tenant_payment_setup_status();

-- Backfill existing tenants that already have destinations but wrong status.
update public.tenants t
set payment_setup_status = 'ready'
where exists (
  select 1 from public.salon_payout_destinations d where d.tenant_id = t.id
)
and payment_setup_status != 'ready';
