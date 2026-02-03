-- Add INSERT policy for service_categories
CREATE POLICY "Users can create service_categories for their tenants"
ON public.service_categories FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Add UPDATE policy for service_categories
CREATE POLICY "Users can update tenant service_categories"
ON public.service_categories FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Add DELETE policy for service_categories
CREATE POLICY "Users can delete tenant service_categories"
ON public.service_categories FOR DELETE
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Create salon-branding storage bucket for logos and banners
INSERT INTO storage.buckets (id, name, public)
VALUES ('salon-branding', 'salon-branding', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for authenticated users to upload branding images
CREATE POLICY "Users can upload branding images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'salon-branding');

-- RLS for authenticated users to update branding images
CREATE POLICY "Users can update branding images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'salon-branding');

-- RLS for authenticated users to delete branding images
CREATE POLICY "Users can delete branding images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'salon-branding');

-- Public read for branding images
CREATE POLICY "Public can view branding images"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'salon-branding');