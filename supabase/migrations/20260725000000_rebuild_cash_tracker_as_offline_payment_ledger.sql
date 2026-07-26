-- Cash Tracker is an append-only ledger of appointment-linked offline cash payments.
-- Keep the existing journal table for migration compatibility, but make new cash
-- entries traceable to their canonical transaction and location.

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.transactions(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_transaction_id
  ON public.journal_entries(transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_location_occurred
  ON public.journal_entries(location_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.record_offline_cash_payment(
  p_appointment_id UUID,
  p_amount NUMERIC,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_appointment public.appointments%ROWTYPE;
  v_transaction_id UUID;
  v_ledger_id UUID;
  v_new_amount_paid NUMERIC;
  v_new_payment_status public.payment_status;
  v_currency TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF NOT (v_appointment.tenant_id IN (SELECT public.get_user_tenant_ids(v_user_id))) THEN
    RAISE EXCEPTION 'You do not have access to this appointment';
  END IF;

  IF v_appointment.scheduled_start IS NULL OR v_appointment.is_unscheduled THEN
    RAISE EXCEPTION 'Select a booked appointment with a scheduled date';
  END IF;

  IF v_appointment.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cash payments cannot be recorded against cancelled appointments';
  END IF;

  IF p_amount > GREATEST(v_appointment.total_amount - v_appointment.amount_paid, 0) THEN
    RAISE EXCEPTION 'Payment exceeds the appointment balance';
  END IF;

  SELECT COALESCE(t.currency, 'USD')
  INTO v_currency
  FROM public.tenants t
  WHERE t.id = v_appointment.tenant_id;

  v_new_amount_paid := v_appointment.amount_paid + p_amount;
  v_new_payment_status := CASE
    WHEN v_new_amount_paid >= v_appointment.total_amount THEN 'fully_paid'::public.payment_status
    ELSE 'deposit_paid'::public.payment_status
  END;

  INSERT INTO public.transactions (
    tenant_id,
    customer_id,
    appointment_id,
    type,
    method,
    amount,
    currency,
    provider,
    provider_reference,
    status,
    created_by_id
  )
  VALUES (
    v_appointment.tenant_id,
    v_appointment.customer_id,
    v_appointment.id,
    'payment',
    'cash',
    p_amount,
    v_currency,
    'offline',
    NULLIF(BTRIM(p_reference), ''),
    'completed',
    v_user_id
  )
  RETURNING id INTO v_transaction_id;

  INSERT INTO public.journal_entries (
    tenant_id,
    location_id,
    transaction_id,
    direction,
    payment_method,
    amount,
    currency,
    description,
    category,
    occurred_at,
    appointment_id,
    customer_id,
    status,
    created_by_id
  )
  VALUES (
    v_appointment.tenant_id,
    v_appointment.location_id,
    v_transaction_id,
    'inflow',
    'cash',
    p_amount,
    v_currency,
    NULLIF(BTRIM(p_notes), ''),
    'service_payment',
    NOW(),
    v_appointment.id,
    v_appointment.customer_id,
    'active',
    v_user_id
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.appointments
  SET amount_paid = v_new_amount_paid,
      payment_status = v_new_payment_status,
      updated_at = NOW()
  WHERE id = v_appointment.id;

  RETURN jsonb_build_object(
    'ledger_entry_id', v_ledger_id,
    'transaction_id', v_transaction_id,
    'appointment_id', v_appointment.id,
    'amount_paid', v_new_amount_paid,
    'payment_status', v_new_payment_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_offline_cash_payment(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_offline_cash_payment(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.record_offline_cash_payment(UUID, NUMERIC, TEXT, TEXT)
  IS 'Atomically records an appointment-linked offline cash payment and updates the appointment balance.';
