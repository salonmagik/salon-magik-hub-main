-- Automatic payout mode is retired — Paystack transfer OTP is now disabled
-- on the account, so on-demand withdrawals (T+1 settlement) work without
-- the friction that made automatic mode appealing in the first place, and
-- the UI toggle to choose between the two has been removed entirely.
--
-- Without this migration, every new tenant would default to 'automatic'
-- forever with no way to ever change it (the only UI that could set
-- 'on_demand' is gone) — and the payment webhook only credits a tenant's
-- internal wallet when payout_mode = 'on_demand', so an 'automatic' tenant
-- would silently never accumulate a withdrawable balance at all.
alter table public.tenants alter column payout_mode set default 'on_demand';

update public.tenants
set payout_mode = 'on_demand'
where payout_mode = 'automatic';
