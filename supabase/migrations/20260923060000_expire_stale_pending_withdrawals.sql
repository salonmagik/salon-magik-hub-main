-- Backfill: a withdrawal stuck in 'pending'/'awaiting_otp' with no
-- transfer.success/failed/reversed webhook ever arriving (e.g. initiated
-- under the retired subaccount flow) permanently blocked any new withdrawal
-- to the same destination, since process-salon-withdrawal's duplicate check
-- had no age limit. The app-level fix (72h staleness cutoff) stops this
-- going forward; this backfills the ones already stuck.
--
-- Safe to run as a plain UPDATE: get_salon_wallet_availability only
-- subtracts pending/awaiting_otp withdrawals from the *computed* available
-- balance — it never debits salon_wallets.balance itself (that only happens
-- once a withdrawal actually completes) — so flipping these to 'failed'
-- needs no offsetting wallet credit.
update public.salon_withdrawals
set status = 'failed',
    failure_reason = coalesce(failure_reason, 'Never confirmed by Paystack and stuck for more than 72 hours — most likely lost when the subaccount-based transfer flow was retired. No funds were reserved against this.')
where status in ('pending', 'awaiting_otp')
  and requested_at < now() - interval '72 hours';
