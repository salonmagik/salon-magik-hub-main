drop view if exists public.public_booking_tenants;

create view public.public_booking_tenants
with (security_invoker = off)
as
select
  id,
  name,
  slug,
  logo_url,
  banner_urls,
  brand_color,
  currency,
  timezone,
  country,
  online_booking_enabled,
  deposits_enabled,
  default_deposit_percentage,
  cancellation_grace_hours,
  booking_status_message,
  slot_capacity_default,
  default_buffer_minutes,
  pay_at_salon_enabled,
  auto_confirm_bookings,
  case when show_contact_on_booking then contact_phone else null end as contact_phone,
  show_contact_on_booking,
  allow_staff_selection,
  require_staff_selection,
  auto_assign_staff
from public.tenants
where online_booking_enabled = true
  and slug is not null;

grant select on public.public_booking_tenants to anon, authenticated;
