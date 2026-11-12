-- Same gap as 20261030110000: 20260807010000_anon_read_vouchers_for_booking.sql
-- defines "Anon can read active tenant vouchers for booking" on
-- public.vouchers, but it does not actually exist on the live database
-- (confirmed via pg_policy — only the staff-facing policies are present).
-- Combined with the voucher_locations gap just fixed, this made every
-- voucher code lookup in public-booking checkout fail with "Invalid or
-- expired voucher code", regardless of whether the code was valid.

begin;

drop policy if exists "Anon can read active tenant vouchers for booking" on public.vouchers;
create policy "Anon can read active tenant vouchers for booking"
on public.vouchers
for select
to anon, authenticated
using (
  status = 'active'
  and tenant_id in (select id from public.public_booking_tenants)
);

commit;
