-- Fix storage policies to be more restrictive (require tenant ownership)
DROP POLICY IF EXISTS "Authenticated users can upload catalog images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own catalog images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete catalog images" ON storage.objects;

-- More restrictive storage policies using tenant folder structure
CREATE POLICY "Tenant members can upload catalog images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'catalog-images' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids(auth.uid()))
);

CREATE POLICY "Tenant members can update catalog images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'catalog-images' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids(auth.uid()))
);

CREATE POLICY "Tenant members can delete catalog images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'catalog-images' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids(auth.uid()))
);