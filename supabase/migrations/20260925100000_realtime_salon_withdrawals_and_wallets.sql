-- The Payouts page's balance/status only ever refreshed on the user's own
-- action (submitting a withdrawal) — a status change that happens
-- server-side (the transfer.success/failed webhook resolving a pending
-- withdrawal) never reached the page without a manual refresh, even though
-- the equivalent notification arrived instantly. That's because neither
-- table was in the Realtime publication, so useWithdrawals/useSalonWallet/
-- useSalonWalletAvailability's new postgres_changes subscriptions would
-- otherwise connect but never receive anything.
alter publication supabase_realtime add table public.salon_withdrawals;
alter publication supabase_realtime add table public.salon_wallets;
