drop policy if exists "Anon can read locations for booking" on public.locations;

create policy "Anon can read locations for booking"
on public.locations
for select
to anon
using (
  (availability is null or availability = 'open')
  and tenant_id in (
    select id
    from public.tenants
    where online_booking_enabled = true
      and slug is not null
  )
);
