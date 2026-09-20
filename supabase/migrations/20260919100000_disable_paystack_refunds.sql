-- Paystack refunds are deliberately benched for this release. Salons must
-- either issue Salon Magik credit or refund the customer by direct transfer/
-- cash and record that action. Historical rows remain available for audit.
update public.refund_requests
set status = 'rejected',
    rejection_reason = 'Paystack refunds are temporarily unavailable; refund by direct transfer or issue salon credit.',
    updated_at = now()
where refund_type = 'paystack' and status in ('pending', 'approved');

create or replace function public.reject_paystack_refund_requests()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.refund_type = 'paystack' then
    raise exception 'Paystack refunds are temporarily unavailable; use direct transfer or salon credit';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_paystack_refund_requests on public.refund_requests;
create trigger reject_paystack_refund_requests
before insert or update of refund_type on public.refund_requests
for each row execute function public.reject_paystack_refund_requests();
