-- Payout readiness is determined by a transfer recipient, not a retired split subaccount.
with ranked_defaults as (
  select id, row_number() over(partition by tenant_id order by created_at desc, id desc) as position
  from public.salon_payout_destinations
  where is_default = true
)
update public.salon_payout_destinations d
set is_default = false
from ranked_defaults r
where d.id = r.id and r.position > 1;

create unique index if not exists one_default_payout_destination_per_tenant
  on public.salon_payout_destinations(tenant_id)
  where is_default = true;

create or replace function public.sync_tenant_payment_setup_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_tenant uuid := coalesce(new.tenant_id,old.tenant_id);
begin
 update tenants set payment_setup_status = case when exists(
   select 1 from salon_payout_destinations where tenant_id=v_tenant and nullif(paystack_recipient_code,'') is not null
 ) then 'ready'::payment_setup_status else 'pending_bank_account'::payment_setup_status end
 where id=v_tenant;
 return coalesce(new,old);
end;
$$;
update tenants t set payment_setup_status = 'ready'::payment_setup_status, payment_setup_error = null
where exists(select 1 from salon_payout_destinations d where d.tenant_id=t.id and nullif(d.paystack_recipient_code,'') is not null);
update tenants t set payment_setup_status = 'pending_bank_account'::payment_setup_status
where payment_setup_status='ready' and not exists(select 1 from salon_payout_destinations d where d.tenant_id=t.id and nullif(d.paystack_recipient_code,'') is not null);
