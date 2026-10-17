-- The client portal's "Bookings & Orders" redesign needs customers to read
-- package/service names (for their package entitlements) and their own
-- vouchers directly. Neither had a customer-self-read policy before now:
-- packages/services only had a staff policy (tenant_id IN get_user_tenant_ids,
-- which a customer's auth.uid() never satisfies) plus an anon policy for the
-- public booking site (which doesn't apply to the authenticated customer
-- role the client portal signs in as). Vouchers had no customer policy at
-- all. Without these, customer_package_entitlements' embedded
-- packages/services joins silently return null, and a direct vouchers query
-- returns zero rows, for the customer role.

CREATE POLICY "Customers can read own salon packages"
ON public.packages FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.customers WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Customers can read own salon services"
ON public.services FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.customers WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Customers can read own salon products"
ON public.products FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.customers WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Customers can read own vouchers"
ON public.vouchers FOR SELECT
TO authenticated
USING (
  purchased_by_customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  )
  OR redeemed_by_customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  )
);
