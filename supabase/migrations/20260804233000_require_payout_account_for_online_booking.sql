-- Online payments no longer block on payment_setup_status at charge time
-- (a missing payout destination just means the charge lands in Salon
-- Magik's own Paystack balance instead of splitting to the salon's
-- subaccount — the salon simply can't withdraw until they add one). The
-- requirement moves earlier instead: a tenant can't turn ON online booking
-- at all until they've set up at least one payout account, so this
-- situation shouldn't arise for a correctly-configured salon.
create or replace function public.enforce_online_booking_requires_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.online_booking_enabled = true
     and (tg_op = 'INSERT' or old.online_booking_enabled is distinct from true) then
    if not exists (
      select 1 from public.salon_payout_destinations
      where tenant_id = new.id
    ) then
      raise exception 'PAYOUT_ACCOUNT_REQUIRED: set up a payout account before enabling online booking'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_online_booking_requires_payout on public.tenants;
create trigger trg_enforce_online_booking_requires_payout
  before insert or update on public.tenants
  for each row
  execute function public.enforce_online_booking_requires_payout();
