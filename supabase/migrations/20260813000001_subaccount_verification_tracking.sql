-- Paystack's subaccount `is_verified` flag isn't synced anywhere in our own
-- schema today — we only ever store whether subaccount *creation* succeeded
-- (paystack_subaccount_active/error), not whether Paystack has actually
-- verified the settlement account behind it. That gap is the leading
-- explanation for a real production booking landing in Salon Magik's own
-- account instead of the salon's: the split silently doesn't apply while a
-- subaccount is unverified. This adds a queryable, periodically-refreshed
-- verification flag so backoffice can see and chase unverified subaccounts
-- before they cause a misrouted payout.

alter table public.salon_payout_destinations
  add column if not exists paystack_subaccount_verified boolean not null default false,
  add column if not exists paystack_subaccount_verification_checked_at timestamptz;
