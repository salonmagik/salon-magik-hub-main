-- Add missing RLS policies for tables that need them
-- =====================================================

-- Service Categories: Users can see categories in their tenants
CREATE POLICY "Users can read tenant service_categories"
    ON public.service_categories FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Packages: Users can see packages in their tenants
CREATE POLICY "Users can read tenant packages"
    ON public.packages FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Package Items: Users can see package items for packages they can access
CREATE POLICY "Users can read tenant package_items"
    ON public.package_items FOR SELECT
    USING (
        package_id IN (
            SELECT id FROM public.packages 
            WHERE tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
        )
    );

-- Customer Purses: Users can see purses in their tenants
CREATE POLICY "Users can read tenant customer_purses"
    ON public.customer_purses FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Appointment Services: Users can see appointment services for appointments they can access
CREATE POLICY "Users can read tenant appointment_services"
    ON public.appointment_services FOR SELECT
    USING (
        appointment_id IN (
            SELECT id FROM public.appointments 
            WHERE tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
        )
    );

-- Appointment Pauses: Users can see pauses for appointments they can access
CREATE POLICY "Users can read tenant appointment_pauses"
    ON public.appointment_pauses FOR SELECT
    USING (
        appointment_id IN (
            SELECT id FROM public.appointments 
            WHERE tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
        )
    );

-- Refund Requests: Users can see refund requests in their tenants
CREATE POLICY "Users can read tenant refund_requests"
    ON public.refund_requests FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Communication Credits: Users can see credits in their tenants
CREATE POLICY "Users can read tenant communication_credits"
    ON public.communication_credits FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Staff Locations: Users can see staff locations in their tenants
CREATE POLICY "Users can read tenant staff_locations"
    ON public.staff_locations FOR SELECT
    USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- Fix handle_new_user function to set search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, phone)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
        NEW.raw_user_meta_data->>'phone'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix update_updated_at_column function to set search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;