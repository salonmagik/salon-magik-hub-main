-- Cancellation, grace-period and billing-anchor state for the subscription
-- lifecycle. Cancellation-pending is deliberately not a new enum value —
-- the tenant stays 'active' the whole time (full paid access), and the
-- pending state is expressed by subscription_cancel_at being set. See the
-- Implementation Design's AD-2 for why.
alter table public.tenants
  add column if not exists subscription_cancel_at      timestamptz,
  add column if not exists cancellation_requested_at   timestamptz,
  add column if not exists cancellation_requested_by   uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_reason         text,
  add column if not exists cancellation_reason_note    text,
  add column if not exists billing_grace_ends_at       timestamptz,
  -- Not in the Implementation Design's column list, but required to make
  -- AD-7's "grace_started_at" concept in billing_dunning_notices well
  -- defined: the design keys dunning notices per grace episode by
  -- grace_started_at, but a tenant's grace deadline (billing_grace_ends_at)
  -- alone can't reconstruct when that episode began once
  -- BILLING_GRACE_PERIOD_DAYS is configurable (AD-6) — subtracting "the
  -- current env var value" from the deadline is wrong once the env var has
  -- changed since grace began. Stamped once alongside billing_grace_ends_at,
  -- cleared on settlement — same lifecycle as the deadline itself.
  add column if not exists billing_grace_started_at    timestamptz,
  add column if not exists billing_period_due_at       timestamptz,
  add column if not exists suspended_at                timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_cancellation_reason_check'
  ) then
    alter table public.tenants
      add constraint tenants_cancellation_reason_check
      check (cancellation_reason is null or cancellation_reason in
        ('too_expensive','missing_features','switching_provider',
         'closing_business','temporary_pause','other'));
  end if;
end $$;

-- Partial indexes: the daily lifecycle pass scans on exactly these two
-- predicates, and both match a tiny fraction of rows.
create index if not exists idx_tenants_cancel_due
  on public.tenants (subscription_cancel_at)
  where subscription_cancel_at is not null;

create index if not exists idx_tenants_grace_due
  on public.tenants (billing_grace_ends_at)
  where billing_grace_ends_at is not null;

create table if not exists public.billing_dunning_notices (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  grace_started_at timestamptz not null,
  notice_key       text not null,
  sent_at          timestamptz not null default now()
);

-- The idempotency guarantee for dunning email (AC 14) is this index, not
-- application logic: the lifecycle pass inserts first and only sends when
-- the insert actually produced a row.
create unique index if not exists idx_billing_dunning_notices_unique
  on public.billing_dunning_notices (tenant_id, grace_started_at, notice_key);

alter table public.billing_dunning_notices enable row level security;
-- service_role only; no tenant- or backoffice-facing policy. Read access for
-- the ledger goes through the security-definer ledger function.
