-- Final billing lifecycle enforcement.
--
-- A trial is operational until its configured end. Once it ends, a tenant
-- either has a reusable Paystack authorization (which is promoted into the
-- normal recurring-charge path by the billing worker) or is suspended. The
-- public storefront, reminders, and server-side messaging all use the same
-- operational predicate.

alter table public.tenants
  add column if not exists payment_method_captured_at timestamptz,
  add column if not exists payment_method_capture_reference text;

create or replace function public.is_tenant_operational(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    case
      when exists (
        select 1
        from public.tenant_trial_overrides o
        where o.tenant_id = p_tenant_id
          and o.status = 'active'
          and now() between o.starts_at and o.ends_at
      ) then true
      else case t.subscription_status
        when 'active' then true
        when 'trialing' then t.trial_ends_at is not null and t.trial_ends_at > now()
        when 'past_due' then t.billing_grace_ends_at is not null and t.billing_grace_ends_at > now()
        else false
      end
    end
  from public.tenants t
  where t.id = p_tenant_id;
$function$;

grant execute on function public.is_tenant_operational(uuid) to anon, authenticated, service_role;

-- Appointment reminders must stop as soon as the salon is no longer
-- operational. This is the database-side guard; the edge function remains
-- protected even if a cron invocation races a subscription transition.
create or replace function public.get_due_appointment_reminders(p_now timestamptz default now())
returns table (
  appointment_id uuid,
  tenant_id uuid,
  customer_id uuid,
  scheduled_start timestamptz,
  offset_minutes integer,
  attempt_count integer,
  email_enabled boolean,
  sms_enabled boolean,
  customer_name text,
  customer_email text,
  customer_phone text,
  tenant_name text,
  tenant_sms_sender_name text
)
language sql
stable
set search_path = public
as $$
  with tenant_offsets as (
    select ns.tenant_id,
           ns.email_appointment_reminders,
           ns.sms_appointment_reminders,
           o.offset_minutes
    from notification_settings ns
    cross join lateral (
      select distinct unnest(array[ns.reminder_hours_before * 60, 30])::int as offset_minutes
    ) o
    where ns.email_appointment_reminders or ns.sms_appointment_reminders
  )
  select a.id, a.tenant_id, a.customer_id, a.scheduled_start,
         tof.offset_minutes, coalesce(d.attempt_count, 0),
         tof.email_appointment_reminders and c.email is not null,
         tof.sms_appointment_reminders and c.phone is not null,
         c.full_name, c.email, c.phone,
         t.name, t.sms_sender_name
  from tenant_offsets tof
  join appointments a
    on a.tenant_id = tof.tenant_id
   and a.status = 'scheduled'
   and a.scheduled_start > p_now
   and a.scheduled_start <= p_now + make_interval(mins => tof.offset_minutes)
  join tenants t on t.id = a.tenant_id
  left join customers c on c.id = a.customer_id
  left join appointment_reminder_sends d
    on d.appointment_id = a.id and d.offset_minutes = tof.offset_minutes
  where public.is_tenant_operational(a.tenant_id)
    and (d.id is null
         or (d.sent_at is null and d.failed_at is null and d.attempt_count < 3))
    and (d.last_attempt_at is null or d.last_attempt_at < p_now - interval '9 minutes')
  order by a.scheduled_start, tof.offset_minutes;
$$;

revoke all on function public.get_due_appointment_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.get_due_appointment_reminders(timestamptz) to service_role;

-- During a live trial the paid storefront theme is available to explore. Once
-- the trial ends, only an active theme entitlement may keep it applied. The
-- storefront is already excluded entirely when is_tenant_operational=false.
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
  t.about_text,
  case
    when t.subscription_status = 'trialing'
      and t.trial_ends_at is not null
      and t.trial_ends_at > now()
      then t.active_theme_key
    when exists (
      select 1
      from public.tenant_addon_entitlements tae
      where tae.tenant_id = t.id
        and tae.addon_type = 'theme_ecommerce'
        and tae.status = 'active'
        and (tae.ends_at is null or tae.ends_at > now())
    ) then t.active_theme_key
    else 'default'
  end as theme_key
from public.tenants t
where t.online_booking_enabled = true
  and t.slug is not null
  and public.is_tenant_operational(t.id);

grant select on public.public_booking_tenants to anon, authenticated;

drop policy if exists "Anon can read locations for booking" on public.locations;
create policy "Anon can read locations for booking"
on public.locations
for select
to anon
using (
  (availability is null or availability = 'open')
  and tenant_id in (select id from public.public_booking_tenants)
);
