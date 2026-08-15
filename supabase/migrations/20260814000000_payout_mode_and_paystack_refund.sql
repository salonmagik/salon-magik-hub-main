-- Step 6 of the payments-rails rebuild: let a salon choose when it gets
-- paid, and let a refund actually go back to Paystack instead of only
-- store credit or an offline log entry.
--
-- "automatic" (default, target behavior): Paystack pays the salon's bank
-- directly ~1 business day after each charge clears — booking payments
-- never touch the internal wallet for these tenants.
-- "on_demand": booking payments keep crediting the internal salon wallet
-- exactly like today, and the salon withdraws whenever they like.
alter table public.tenants
  add column if not exists payout_mode text not null default 'automatic'
    check (payout_mode in ('automatic', 'on_demand'));

-- A real Paystack refund is a genuinely new capability (previously the only
-- options were store credit or an offline/manual log entry — see
-- RequestRefundDialog.tsx). 'original_method' already exists but means
-- something narrower (refund back into whatever method was originally
-- used, which for a purse payment just means store credit) — this adds a
-- distinct value for "actually call Paystack's refund API."
alter type public.refund_type add value if not exists 'paystack';
