-- Records refund attempts blocked because the salon's wallet could not cover
-- the amount at the moment of the attempt (see debit_salon_wallet_for_refund,
-- next migration). No behaviour change yet — this migration only adds the
-- table the enforcement point will write to.

create table public.refund_block_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  refund_request_id uuid references public.refund_requests(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  refund_type public.refund_type not null,
  attempted_amount numeric(12,2) not null check (attempted_amount > 0),
  currency text not null,
  wallet_balance_at_attempt numeric(12,2) not null,
  shortfall numeric(12,2) not null,
  block_code text not null default 'INSUFFICIENT_RECOVERABLE_FUNDS',
  reason text,
  attempted_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_refund_block_events_tenant_created
  on public.refund_block_events (tenant_id, created_at desc);
create index idx_refund_block_events_created
  on public.refund_block_events (created_at desc);
create index idx_refund_block_events_transaction
  on public.refund_block_events (transaction_id);

alter table public.refund_block_events enable row level security;

create policy "Active owners/managers can view their tenant's blocked refunds"
  on public.refund_block_events
  for select
  using (
    exists (
      select 1 from public.user_roles
      where tenant_id = refund_block_events.tenant_id
        and user_id = auth.uid()
        and role in ('owner', 'manager')
        and is_active = true
    )
  );
