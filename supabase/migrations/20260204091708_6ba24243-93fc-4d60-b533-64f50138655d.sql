-- =====================================================
-- Client Portal: Customer Self-Access RLS Policies
-- =====================================================
-- These policies allow authenticated customers to access
-- their own data across all tenants (salons) they're linked to

-- 1. Customers can read their own customer records
CREATE POLICY "Customers can read own customer records"
ON customers FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 2. Customers can update their own customer records (limited fields)
CREATE POLICY "Customers can update own customer records"
ON customers FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 3. Customers can read their own appointments
CREATE POLICY "Customers can read own appointments"
ON appointments FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- 4. Customers can update their own appointments (for status like "on_my_way")
CREATE POLICY "Customers can update own appointments"
ON appointments FOR UPDATE
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- 5. Customers can read their own purses
CREATE POLICY "Customers can read own purses"
ON customer_purses FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- 6. Customers can read their own transactions
CREATE POLICY "Customers can read own transactions"
ON transactions FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- 7. Customers can read their own refund requests
CREATE POLICY "Customers can read own refund requests"
ON refund_requests FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- 8. Customers can create refund requests for their own transactions
CREATE POLICY "Customers can create own refund requests"
ON refund_requests FOR INSERT
TO authenticated
WITH CHECK (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- 9. Customers can read notifications targeted at them
CREATE POLICY "Customers can read own notifications"
ON notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 10. Customers can update their own notifications (mark as read)
CREATE POLICY "Customers can update own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 11. Customers can read their appointment services
CREATE POLICY "Customers can read own appointment services"
ON appointment_services FOR SELECT
TO authenticated
USING (
  appointment_id IN (
    SELECT id FROM appointments WHERE customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  )
);

-- 12. Customers can read their appointment products
CREATE POLICY "Customers can read own appointment products"
ON appointment_products FOR SELECT
TO authenticated
USING (
  appointment_id IN (
    SELECT id FROM appointments WHERE customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  )
);

-- 13. Customers can read tenants (salons) they are linked to
CREATE POLICY "Customers can read own tenants"
ON tenants FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT tenant_id FROM customers WHERE user_id = auth.uid()
  )
);

-- 14. Customers can read locations of salons they visit
CREATE POLICY "Customers can read own salon locations"
ON locations FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM customers WHERE user_id = auth.uid()
  )
);