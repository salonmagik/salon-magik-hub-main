-- Create storage bucket for appointment attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('appointment-attachments', 'appointment-attachments', true);

-- Allow authenticated users to upload files to their tenant's folder
CREATE POLICY "Users can upload appointment attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'appointment-attachments' 
  AND auth.uid() IS NOT NULL
);

-- Allow users to read their tenant's attachments
CREATE POLICY "Users can read appointment attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'appointment-attachments');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete appointment attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'appointment-attachments' 
  AND auth.uid() IS NOT NULL
);

-- Create a table to track appointment attachments
CREATE TABLE public.appointment_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  is_drawing BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by_id UUID
);

-- Enable RLS
ALTER TABLE public.appointment_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read tenant appointment_attachments"
ON public.appointment_attachments FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can create appointment_attachments for their tenants"
ON public.appointment_attachments FOR INSERT
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can delete tenant appointment_attachments"
ON public.appointment_attachments FOR DELETE
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));