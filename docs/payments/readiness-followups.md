# Payment readiness follow-ups

## Deferred: live-money tests in staging
Requested 2026-09-16. Investigate using staging Supabase with Paystack live-mode
accounts for isolated real-money verification. Do not change credentials or start
live transfers as part of this note. Check webhook routing, account separation,
reconciliation, fixture isolation and production data impact before proposing it.

## Active release scope
- Reconcile the existing refund-wallet and notification migrations with development.
- Prevent duplicate charge-success payment records and messaging-credit grants.
- Reconcile Paystack refund events, including dashboard-initiated refunds.
- Remove the retired subaccount/split payout path.
- Preserve salon-paid withdrawal fees and the NGN 500 / GHS 50 minimums.
- Use BrandLoader while verifying payment returns, including failed return URLs.
- Verify initiation calls, refund/withdrawal transitions and non-refundable fee disclosure.
- Push the completed, verified changes to development; production rollout remains with the user.
