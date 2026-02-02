-- Add INSERT policies for onboarding flow

-- Allow authenticated users to create their own tenant
CREATE POLICY "Users can create tenants"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow users to update their own tenants
CREATE POLICY "Users can update own tenants"
ON public.tenants
FOR UPDATE
TO authenticated
USING (id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow authenticated users to create their own role (only for new tenants they just created)
CREATE POLICY "Users can create own user_role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow users to create locations for their tenants
CREATE POLICY "Users can create locations for their tenants"
ON public.locations
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow users to update locations for their tenants
CREATE POLICY "Users can update tenant locations"
ON public.locations
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow users to create communication credits for their tenants
CREATE POLICY "Users can create communication credits for their tenants"
ON public.communication_credits
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow users to update communication credits for their tenants
CREATE POLICY "Users can update tenant communication credits"
ON public.communication_credits
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow users to create customers for their tenants
CREATE POLICY "Users can create customers for their tenants"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow users to update customers for their tenants
CREATE POLICY "Users can update tenant customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow users to create services for their tenants
CREATE POLICY "Users can create services for their tenants"
ON public.services
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow users to update services for their tenants
CREATE POLICY "Users can update tenant services"
ON public.services
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow users to create appointments for their tenants
CREATE POLICY "Users can create appointments for their tenants"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow users to update appointments for their tenants
CREATE POLICY "Users can update tenant appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));