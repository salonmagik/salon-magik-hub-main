-- public.vouchers has never had an anon-read policy — only "Users can read
-- tenant vouchers" (staff, scoped to their own tenant) has existed since the
-- table was created. VoucherInput.tsx (apps/public-booking) queries vouchers
-- directly as the anonymous checkout customer to validate a code, which has
-- therefore always returned zero rows and surfaced "Invalid or expired
-- voucher code" for every public-booking customer, regardless of whether the
-- code was actually valid. This is separate from (and upstream of) the
-- voucher_locations mapping-table fix in 20260806230000_paused_location_enforcement.sql
-- — that fix only helps once a voucher row is visible in the first place.

begin;

create policy "Anon can read active tenant vouchers for booking"
on public.vouchers
for select
to anon, authenticated
using (
  status = 'active'
  and tenant_id in (select id from public.public_booking_tenants)
);

commit;
