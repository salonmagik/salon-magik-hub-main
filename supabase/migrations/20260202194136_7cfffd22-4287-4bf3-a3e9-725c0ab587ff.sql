-- Add INSERT and UPDATE policies for products table
CREATE POLICY "Users can create products for their tenants"
ON public.products
FOR INSERT
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can update tenant products"
ON public.products
FOR UPDATE
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Add INSERT and UPDATE policies for packages table
CREATE POLICY "Users can create packages for their tenants"
ON public.packages
FOR INSERT
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can update tenant packages"
ON public.packages
FOR UPDATE
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Add INSERT policy for package_items table
CREATE POLICY "Users can create package_items for their tenants"
ON public.package_items
FOR INSERT
WITH CHECK (package_id IN (
  SELECT id FROM packages WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
));

-- Add INSERT policy for transactions table
CREATE POLICY "Users can create transactions for their tenants"
ON public.transactions
FOR INSERT
WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));