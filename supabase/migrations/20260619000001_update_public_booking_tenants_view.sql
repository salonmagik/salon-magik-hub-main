-- Recreate the view to expose the payment_setup_status column.
-- DROP ... CASCADE is required because the "Anon can read locations for booking" policy
-- on locations depends on this view. CASCADE drops that policy automatically; we
-- re-create it below after the view is restored.
drop view if exists public.public_booking_tenants cascade;
create view public.public_booking_tenants
with (security_invoker = off)
as
select
  t.id,
  t.name,
  t.slug,
  t.logo_url,
  t.banner_urls,
  t.brand_color,
  t.currency,
  t.timezone,
  t.country,
  t.online_booking_enabled,
  t.deposits_enabled,
  t.default_deposit_percentage,
  t.cancellation_grace_hours,
  t.booking_status_message,
  t.booking_page_bio,
  t.slot_capacity_default,
  t.default_buffer_minutes,
  t.pay_at_salon_enabled,
  t.auto_confirm_bookings,
  case when t.show_contact_on_booking then t.contact_phone else null end as contact_phone,
  t.show_contact_on_booking,
  t.allow_staff_selection,
  t.require_staff_selection,
  t.auto_assign_staff,
  t.payment_setup_status,
  (
    select tae.addon_key
    from public.tenant_addon_entitlements tae
    where tae.tenant_id = t.id
      and tae.addon_type = 'theme_ecommerce'
      and tae.status = 'active'
      and (tae.ends_at is null or tae.ends_at > now())
    order by tae.created_at desc
    limit 1
  ) as theme_key
from public.tenants t
where t.online_booking_enabled = true
  and t.slug is not null;

grant select on public.public_booking_tenants to anon, authenticated;

-- Re-create the locations RLS policy that was dropped by CASCADE above.
drop policy if exists "Anon can read locations for booking" on public.locations;
create policy "Anon can read locations for booking"
on public.locations
for select
to anon
using (
  (availability is null or availability = 'open')
  and tenant_id in (
    select id from public.public_booking_tenants
  )
);
