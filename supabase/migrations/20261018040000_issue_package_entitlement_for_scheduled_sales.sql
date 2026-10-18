-- issue_unscheduled_package_purchase() only issued a customer_package_entitlements
-- row when the appointment it fired for was is_unscheduled = true -- i.e. a
-- standalone walk-in/unscheduled package purchase. But salon-admin also lets a
-- package be sold directly as part of a dated, scheduled appointment (its
-- appointment_services.package_id gets set the same way), and that path never
-- created an entitlement at all, so the customer's purchased package never
-- showed up anywhere entitlements are read from (client-portal "Packages"
-- section, package balance checks, etc.) even though the booking itself
-- correctly displayed as a "Package session". Drop the is_unscheduled
-- requirement so a fully-paid package sale issues an entitlement regardless of
-- whether it was sold standalone or attached to a scheduled visit; keep the
-- fully_paid requirement so a deposit-only payment doesn't issue early.
create or replace function public.issue_unscheduled_package_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package_id uuid;
begin
  if new.status <> 'completed'
     or new.type <> 'payment'
     or new.appointment_id is null
     or new.customer_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.appointments
    where id = new.appointment_id
      and payment_status = 'fully_paid'
  ) then
    return new;
  end if;

  for v_package_id in
    select distinct package_id
    from public.appointment_services
    where appointment_id = new.appointment_id
      and package_id is not null
  loop
    if not exists (
      select 1
      from public.customer_package_entitlements pe
      join public.transactions purchase on purchase.id = pe.purchased_transaction_id
      where purchase.appointment_id = new.appointment_id
        and pe.package_id = v_package_id
    ) then
      perform public.issue_customer_package(
        new.tenant_id,
        new.customer_id,
        v_package_id,
        new.id,
        null
      );
    end if;
  end loop;

  return new;
end;
$$;
