-- Fix RLS policy for anonymous users to read locations
-- 
-- ISSUE: The previous policy referenced public.tenants table in a subquery,
-- but the anon role doesn't have SELECT permission on that table.
-- This caused the subquery to fail silently, blocking all location access.
--
-- SOLUTION: Use public_booking_tenants view instead, which:
-- 1. Already filters for online_booking_enabled=true and slug IS NOT NULL
-- 2. Has explicit grant for anon role
-- 3. Only exposes safe public booking columns (security_invoker=off)
--
-- SECURITY: This maintains the same security model - only locations belonging
-- to tenants with public booking enabled are visible to anonymous users.

-- Drop the existing broken policy
drop policy if exists "Anon can read locations for booking" on public.locations;

-- Recreate the policy using the public_booking_tenants view
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
