-- Tracks consecutive recurring add-on charge failures so
-- process-recurring-addon-billing can retry a couple of times before giving
-- up and marking the tenant past_due, per the simple v1 retry policy.
alter table public.tenants
  add column if not exists billing_retry_count integer not null default 0;
