-- Fix customers table: restrict SELECT to authenticated users only
DROP POLICY IF EXISTS "Users can read tenant customers" ON public.customers;

CREATE POLICY "Users can read tenant customers" 
ON public.customers 
FOR SELECT 
TO authenticated
USING (tenant_id IN ( SELECT get_user_tenant_ids(auth.uid()) AS get_user_tenant_ids));

-- Fix audit_logs table: restrict SELECT to authenticated users only
DROP POLICY IF EXISTS "Users can read tenant audit logs" ON public.audit_logs;

CREATE POLICY "Users can read tenant audit logs" 
ON public.audit_logs 
FOR SELECT 
TO authenticated
USING (tenant_id IN ( SELECT get_user_tenant_ids(auth.uid()) AS get_user_tenant_ids));