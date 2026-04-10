-- Add payment_group_id to transactions table for grouping split payments
alter table public.transactions
add column if not exists payment_group_id uuid;

-- Add index for better query performance
create index if not exists idx_transactions_payment_group_id
on public.transactions(payment_group_id)
where payment_group_id is not null;

-- Add comment explaining the field
comment on column public.transactions.payment_group_id is 'Groups multiple transaction records that represent a single logical payment (e.g., split payments with card + purse)';
