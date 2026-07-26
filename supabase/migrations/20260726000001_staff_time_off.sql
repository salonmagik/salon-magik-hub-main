-- Tenant-scoped staff leave allowances and approved time off.
CREATE TABLE public.staff_time_off_policies (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('annual', 'sick', 'compassionate')),
  allowance_days integer NOT NULL DEFAULT 0 CHECK (allowance_days >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (tenant_id, leave_type)
);

CREATE TABLE public.staff_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('annual', 'sick', 'compassionate')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  days_used integer GENERATED ALWAYS AS ((ends_on - starts_on) + 1) STORED,
  note text,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT staff_time_off_valid_dates CHECK (ends_on >= starts_on)
);

CREATE INDEX staff_time_off_tenant_user_dates_idx
  ON public.staff_time_off (tenant_id, user_id, starts_on, ends_on);

INSERT INTO public.staff_time_off_policies (tenant_id, leave_type, allowance_days)
SELECT id, leave_type, allowance_days
FROM public.tenants
CROSS JOIN (
  VALUES ('annual', 20), ('sick', 10), ('compassionate', 5)
) AS defaults(leave_type, allowance_days)
ON CONFLICT DO NOTHING;

ALTER TABLE public.staff_time_off_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_time_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff can view leave policies"
ON public.staff_time_off_policies FOR SELECT
USING (public.belongs_to_tenant(auth.uid(), tenant_id));

CREATE POLICY "Owners and managers can update leave policies"
ON public.staff_time_off_policies FOR ALL
USING (
  public.has_role(auth.uid(), tenant_id, 'owner')
  OR public.has_role(auth.uid(), tenant_id, 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), tenant_id, 'owner')
  OR public.has_role(auth.uid(), tenant_id, 'manager')
);

CREATE POLICY "Tenant staff can view time off"
ON public.staff_time_off FOR SELECT
USING (public.belongs_to_tenant(auth.uid(), tenant_id));

CREATE POLICY "Owners and managers can manage time off"
ON public.staff_time_off FOR ALL
USING (
  public.has_role(auth.uid(), tenant_id, 'owner')
  OR public.has_role(auth.uid(), tenant_id, 'manager')
)
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  )
);

COMMENT ON TABLE public.staff_time_off_policies IS
  'Default annual leave limits for each salon. Managers and owners configure these buckets.';
COMMENT ON TABLE public.staff_time_off IS
  'Approved staff time off, including the approving account for auditability.';
