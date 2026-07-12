-- Paystack's Plan/Subscription objects only support a FIXED recurring amount,
-- so they can't track a tenant's total as seats/branches/themes change month
-- to month. To self-manage recurring billing for the variable portion we need
-- a reusable card token captured from any successful payment.
alter table public.tenants
  add column if not exists paystack_authorization_code text,
  add column if not exists paystack_customer_code text,
  add column if not exists paystack_authorization_email text,
  add column if not exists next_billing_at timestamptz;
