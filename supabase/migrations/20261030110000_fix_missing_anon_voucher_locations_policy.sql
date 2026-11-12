-- 20260806230000_paused_location_enforcement.sql defines
-- "Anon can read voucher location mappings for booking" on
-- public.voucher_locations, but that policy does not actually exist on the
-- live database (confirmed via pg_policy — only the pre-existing
-- authenticated-only "Users can manage voucher location mappings in tenant"
-- policy is present). The sibling anon policies on service_locations,
-- product_locations and package_locations from the same migration are also
-- absent, but nothing in the app queries those three tables directly as
-- anon (catalog listings go through edge functions). VoucherInput.tsx
-- (apps/public-booking) does query voucher_locations directly as anon to
-- resolve which vouchers are valid at the selected location, so this gap
-- has made every voucher code application in public-booking checkout fail
-- with "This voucher is not available for the selected location" —
-- regardless of whether the voucher is actually scoped to that location.

begin;

drop policy if exists "Anon can read voucher location mappings for booking" on public.voucher_locations;
create policy "Anon can read voucher location mappings for booking"
  on public.voucher_locations
  for select
  to anon, authenticated
  using (
    tenant_id in (select id from public.public_booking_tenants)
    and public.is_location_active(location_id)
  );

commit;
