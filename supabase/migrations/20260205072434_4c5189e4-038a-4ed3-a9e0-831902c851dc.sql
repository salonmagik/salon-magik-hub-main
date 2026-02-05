-- Add RLS policies for BackOffice users to manage waitlist
CREATE POLICY "BackOffice users can read waitlist"
ON public.waitlist_leads
FOR SELECT
USING (is_backoffice_user(auth.uid()));

CREATE POLICY "BackOffice users can update waitlist"
ON public.waitlist_leads
FOR UPDATE
USING (is_backoffice_user(auth.uid()))
WITH CHECK (is_backoffice_user(auth.uid()));

-- Add RLS policy for BackOffice users to read all tenants (for tenant overview)
CREATE POLICY "BackOffice users can read all tenants"
ON public.tenants
FOR SELECT
USING (is_backoffice_user(auth.uid()));

-- Add RLS policy for BackOffice users to update tenants
CREATE POLICY "BackOffice users can update tenants"
ON public.tenants
FOR UPDATE
USING (is_backoffice_user(auth.uid()))
WITH CHECK (is_backoffice_user(auth.uid()));

-- Add RLS policy for BackOffice users to read all user roles (for staff counts)
CREATE POLICY "BackOffice users can read all user roles"
ON public.user_roles
FOR SELECT
USING (is_backoffice_user(auth.uid()));

-- Add RLS policy for BackOffice users to read all profiles (for impersonation info)
CREATE POLICY "BackOffice users can read all profiles"
ON public.profiles
FOR SELECT
USING (is_backoffice_user(auth.uid()));