-- Phase 1: Security Hardening (Corrected)

-- 1.1 Fix profiles table - Drop existing and recreate
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view tenant member profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (user_id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Authenticated users can view profiles of users in the same tenant (for staff directory)
CREATE POLICY "Users can view tenant member profiles"
ON public.profiles
FOR SELECT
USING (
  user_id IN (
    SELECT ur.user_id 
    FROM public.user_roles ur 
    WHERE ur.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
);

-- 1.2 Fix appointments table - Restrict anonymous access
DROP POLICY IF EXISTS "Anon can read appointments for availability" ON public.appointments;
DROP POLICY IF EXISTS "Anon can check availability slots only" ON public.appointments;

-- Create a more restrictive policy for anonymous availability checking
CREATE POLICY "Anon can check availability slots only"
ON public.appointments
FOR SELECT
TO anon
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE online_booking_enabled = true
  )
  AND status IN ('scheduled', 'started', 'paused')
);

-- 1.3 Strengthen notifications isolation
DROP POLICY IF EXISTS "Users can read tenant notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can create notifications for their tenants" ON public.notifications;
DROP POLICY IF EXISTS "Users can update notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update tenant notifications" ON public.notifications;
DROP POLICY IF EXISTS "Customers can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Customers can update own notifications" ON public.notifications;

-- Recreate with explicit tenant isolation
CREATE POLICY "Users can read tenant notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  OR user_id = auth.uid()
);

CREATE POLICY "Users can create notifications for their tenants"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

CREATE POLICY "Users can update tenant notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  OR user_id = auth.uid()
)
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  OR user_id = auth.uid()
);