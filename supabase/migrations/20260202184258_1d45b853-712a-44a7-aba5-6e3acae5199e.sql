-- Add INSERT policies for appointment_services
CREATE POLICY "Users can create appointment_services for their tenants"
ON public.appointment_services
FOR INSERT
WITH CHECK (
  appointment_id IN (
    SELECT id FROM public.appointments
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
);

-- Add INSERT policies for appointment_pauses
CREATE POLICY "Users can create appointment_pauses for their tenants"
ON public.appointment_pauses
FOR INSERT
WITH CHECK (
  appointment_id IN (
    SELECT id FROM public.appointments
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
);

-- Add UPDATE policy for appointment_pauses (for resuming)
CREATE POLICY "Users can update appointment_pauses for their tenants"
ON public.appointment_pauses
FOR UPDATE
USING (
  appointment_id IN (
    SELECT id FROM public.appointments
    WHERE tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
);