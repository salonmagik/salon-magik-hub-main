-- Links a completed refund to the wallet-ledger debit that covered it
-- (auditability), and stops one debit from being reused to justify two
-- refunds via a partial unique index rather than only an in-function check.

alter table public.refund_requests
  add column if not exists wallet_debit_entry_id uuid
    references public.wallet_ledger_entries(id) on delete set null;

create unique index if not exists uq_refund_requests_wallet_debit_entry
  on public.refund_requests (wallet_debit_entry_id)
  where wallet_debit_entry_id is not null;
