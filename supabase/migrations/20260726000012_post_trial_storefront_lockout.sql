-- Salons whose trial has ended (past the same grace period the salon-admin
-- app itself already enforces — see GRACE_PERIOD_DAYS in useTrialEnforcement)
-- and who haven't upgraded, or whose paid subscription has lapsed
-- (past_due/canceled/paused/permanently_deactivated), must not have an
-- operational public storefront, and clients must not be able to book or
-- purchase from them. Previously NOTHING enforced this anywhere.
--
-- Two layers:
--   1. public_booking_tenants excludes non-operational tenants entirely, so
--      their storefront resolves as "not found" (no browse/preview at all).
--   2. create-public-booking hard-blocks the write path server-side too —
--      the view alone only stops browsing; someone could still POST directly
--      with a known tenant_id.

create or replace function public.is_tenant_operational(p_tenant_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    case t.subscription_status
      when 'active' then true
      when 'trialing' then t.trial_ends_at is not null and t.trial_ends_at + interval '3 days' > now()
      else false
    end
  from public.tenants t
  where t.id = p_tenant_id;
$$;

grant execute on function public.is_tenant_operational(uuid) to anon, authenticated, service_role;

-- Recreate view to additionally require an operational subscription.
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
  t.storefront_mode,
  t.hero_heading,
  t.hero_tagline,
  t.hero_cta_primary,
  t.hero_cta_secondary,
  t.hero_bg_color,
  t.about_text,
  t.active_theme_key as theme_key
from public.tenants t
where t.online_booking_enabled = true
  and t.slug is not null
  and public.is_tenant_operational(t.id);

grant select on public.public_booking_tenants to anon, authenticated;

-- Restore the locations RLS policy dropped by CASCADE above.
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
