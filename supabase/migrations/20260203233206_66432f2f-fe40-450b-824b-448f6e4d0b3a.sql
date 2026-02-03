-- Allow anon users to read booking-enabled tenants by slug
CREATE POLICY "Anon can read booking-enabled tenants by slug"
ON public.tenants FOR SELECT TO anon
USING (online_booking_enabled = true AND slug IS NOT NULL);

-- Allow anon users to read active services for booking-enabled tenants
CREATE POLICY "Anon can read active services for booking"
ON public.services FOR SELECT TO anon
USING (status = 'active' AND tenant_id IN (
  SELECT id FROM tenants WHERE online_booking_enabled = true AND slug IS NOT NULL
));

-- Allow anon users to read active packages for booking-enabled tenants
CREATE POLICY "Anon can read active packages for booking"
ON public.packages FOR SELECT TO anon
USING (status = 'active' AND tenant_id IN (
  SELECT id FROM tenants WHERE online_booking_enabled = true AND slug IS NOT NULL
));

-- Allow anon users to read active products for booking-enabled tenants
CREATE POLICY "Anon can read active products for booking"
ON public.products FOR SELECT TO anon
USING (status = 'active' AND tenant_id IN (
  SELECT id FROM tenants WHERE online_booking_enabled = true AND slug IS NOT NULL
));

-- Allow anon users to read service categories for booking-enabled tenants
CREATE POLICY "Anon can read service categories for booking"
ON public.service_categories FOR SELECT TO anon
USING (tenant_id IN (
  SELECT id FROM tenants WHERE online_booking_enabled = true AND slug IS NOT NULL
));

-- Allow anon users to read package items for booking-enabled tenants
CREATE POLICY "Anon can read package items for booking"
ON public.package_items FOR SELECT TO anon
USING (package_id IN (
  SELECT id FROM packages WHERE status = 'active' AND tenant_id IN (
    SELECT id FROM tenants WHERE online_booking_enabled = true AND slug IS NOT NULL
  )
));

-- Allow anon users to read open locations for booking-enabled tenants
CREATE POLICY "Anon can read locations for booking"
ON public.locations FOR SELECT TO anon
USING (availability = 'open' AND tenant_id IN (
  SELECT id FROM tenants WHERE online_booking_enabled = true AND slug IS NOT NULL
));