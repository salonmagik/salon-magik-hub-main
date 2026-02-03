-- Storage RLS policies for salon-branding bucket
-- Allow authenticated users to upload to salon-branding bucket
CREATE POLICY "Authenticated users can upload branding"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'salon-branding');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update branding"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'salon-branding');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete branding"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'salon-branding');

-- Public can view all branding assets
CREATE POLICY "Public can view branding"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'salon-branding');