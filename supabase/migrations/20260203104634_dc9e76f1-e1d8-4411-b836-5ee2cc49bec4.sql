-- Phase 4: Add RLS policies for refund_requests to allow INSERT and UPDATE

-- Allow users to create refund requests for their tenants
CREATE POLICY "Users can create refund requests for their tenants"
ON public.refund_requests
FOR INSERT
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Allow users to update refund requests for their tenants (for approval/rejection)
CREATE POLICY "Users can update refund requests for their tenants"
ON public.refund_requests
FOR UPDATE
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));