-- The previous fix (20261018040000) made issue_unscheduled_package_purchase()
-- fire for scheduled package sales too, but it's still keyed off a *transaction*
-- row with a matching appointment_id. A multi-item cart checkout (several
-- appointments paid in one Paystack charge) only ever gets ONE transactions
-- row, attached to the first appointment_id in the cart -- every other
-- appointment in that same order has payment_status = 'fully_paid' but no
-- transactions row of its own at all, so the trigger on `transactions` never
-- fires for it and no entitlement is ever issued. This is exactly how the
-- reported "Packages" bug reproduced: a package sold as the 4th item in a
-- multi-item booking.
--
-- Add an appointment-level trigger that issues the entitlement directly off
-- appointments.payment_status transitioning to fully_paid, independent of
-- whether a transactions row happens to exist for that specific appointment.
-- Dedupe by a new source_appointment_id column rather than
-- purchased_transaction_id, since a shared-order appointment may have no
-- transaction of its own to key off.

alter table public.customer_package_entitlements
  add column if not exists source_appointment_id uuid references public.appointments(id) on delete set null;

create index if not exists idx_customer_package_entitlements_source_appointment
  on public.customer_package_entitlements (source_appointment_id)
  where source_appointment_id is not null;

create or replace function public.issue_package_entitlements_for_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package_id uuid;
  v_transaction_id uuid;
  v_entitlement_id uuid;
begin
  if new.payment_status <> 'fully_paid'
     or (tg_op = 'UPDATE' and old.payment_status = 'fully_paid')
     or new.customer_id is null then
    return new;
  end if;

  -- Best-effort: if this appointment does have its own completed payment
  -- transaction, still record it for traceability, but it's no longer the
  -- dedupe key.
  select id into v_transaction_id
  from public.transactions
  where appointment_id = new.id and type = 'payment' and status = 'completed'
  order by created_at desc
  limit 1;

  for v_package_id in
    select distinct package_id
    from public.appointment_services
    where appointment_id = new.id
      and package_id is not null
  loop
    if not exists (
      select 1
      from public.customer_package_entitlements
      where source_appointment_id = new.id
        and package_id = v_package_id
    ) then
      v_entitlement_id := public.issue_customer_package(
        new.tenant_id,
        new.customer_id,
        v_package_id,
        v_transaction_id,
        null
      );
      update public.customer_package_entitlements
      set source_appointment_id = new.id
      where id = v_entitlement_id
        and source_appointment_id is null;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_issue_package_entitlements_for_appointment on public.appointments;
create trigger trg_issue_package_entitlements_for_appointment
after insert or update of payment_status on public.appointments
for each row
execute function public.issue_package_entitlements_for_appointment();

-- Superseded by the appointment-level trigger above, which covers everything
-- the transaction-level trigger did (walk-ins) plus the cases it missed
-- (scheduled sales, multi-item cart checkouts). Keeping both would risk a
-- double-issued entitlement for the single-appointment case, since they'd
-- use different dedupe keys (purchased_transaction_id vs
-- source_appointment_id) and could both decide "none exists yet" for the
-- same package.
drop trigger if exists trg_issue_unscheduled_package_purchase on public.transactions;
