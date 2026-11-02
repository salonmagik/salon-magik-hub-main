-- Staff Operations is available while a salon is in its live trial. After the
-- trial, the same tables require an active Staff Operations entitlement.
CREATE OR REPLACE FUNCTION public.has_staff_operations_access(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND public.is_tenant_operational(t.id)
      AND (
        t.subscription_status = 'trialing'
        OR EXISTS (
          SELECT 1
          FROM public.tenant_addon_entitlements tae
          WHERE tae.tenant_id = t.id
            AND tae.addon_type = 'staff_operations'
            AND tae.status = 'active'
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Tenant staff can view check-ins" ON public.staff_check_ins;
CREATE POLICY "Tenant staff can view check-ins"
ON public.staff_check_ins FOR SELECT
USING (
  public.belongs_to_tenant(auth.uid(), tenant_id)
  AND public.has_staff_operations_access(tenant_id)
);

DROP POLICY IF EXISTS "Tenant staff can view time off" ON public.staff_time_off;
CREATE POLICY "Tenant staff can view time off"
ON public.staff_time_off FOR SELECT
USING (
  public.belongs_to_tenant(auth.uid(), tenant_id)
  AND public.has_staff_operations_access(tenant_id)
);

DROP POLICY IF EXISTS "Staff can check themselves in" ON public.staff_check_ins;
CREATE POLICY "Staff can check themselves in"
ON public.staff_check_ins FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND public.belongs_to_tenant(auth.uid(), tenant_id)
  AND public.has_staff_operations_access(tenant_id)
);

DROP POLICY IF EXISTS "Owners and managers can manage any check-in" ON public.staff_check_ins;
CREATE POLICY "Owners and managers can manage any check-in"
ON public.staff_check_ins FOR ALL
USING (
  public.has_staff_operations_access(tenant_id)
  AND (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  )
)
WITH CHECK (
  public.has_staff_operations_access(tenant_id)
  AND (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  )
);

DROP POLICY IF EXISTS "Owners and managers can manage time off" ON public.staff_time_off;
CREATE POLICY "Owners and managers can manage time off"
ON public.staff_time_off FOR ALL
USING (
  public.has_staff_operations_access(tenant_id)
  AND (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  )
)
WITH CHECK (
  created_by = auth.uid()
  AND public.has_staff_operations_access(tenant_id)
  AND (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  )
);
