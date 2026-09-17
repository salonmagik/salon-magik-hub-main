# Salon-paid withdrawal charges

Policy agreed 2026-09-16: the salon bears Paystack transfer charges without a
Salon Magik markup. The entered amount is what the salon receives. The wallet
must cover that amount plus transfer fee and applicable stamp duty. Minimums
remain NGN 500 / GHS 50. Settlement eligibility is unchanged.

| Destination / amount received | Transfer fee | Stamp duty |
| --- | ---: | ---: |
| Ghana mobile money | GHS 1 | 0 |
| Ghana bank | GHS 8 | 0 |
| Nigeria up to NGN 5,000 | NGN 10 | 0 |
| Nigeria above NGN 5,000, below NGN 10,000 | NGN 25 | 0 |
| Nigeria NGN 10,000 through NGN 50,000 | NGN 25 | NGN 50 |
| Nigeria above NGN 50,000 | NGN 50 | NGN 50 |

Sources verified 2026-09-16:
- https://support.paystack.com/en/articles/2130370
- https://support.paystack.com/en/articles/7573314
- https://paystack.com/docs/transfers/how-transfers-work/

Paystack debits the platform balance; the application recovers the charge from
the salon wallet. These are separate from customer payment transaction fees.
Pricing is versioned and stored on each withdrawal. A tariff change requires
updating the shared calculator and the database validation together. Existing
withdrawals retain their original zero-fee policy, including in-flight ones.

## Accounting

The form discloses amount received, transfer fee, stamp duty and total deduction.
The backend independently computes the quote and requires that the submitted
total and policy version match. The database verifies the fee snapshot, locks
the wallet and reserves the full amount against cleared availability. Concurrent
withdrawals cannot reuse that reservation. Paystack balance sufficiency also
includes charges. An uncertain network or 5xx outcome stays reserved until
reconciled; do not retry with a new reference until the outcome is known.

For fee-bearing withdrawals, finalization locks the withdrawal and wallet and
atomically writes the ledger and terminal status. Duplicate callbacks are inert.
Transfers are acknowledged only after processing finishes, allowing retries on
database failures. Legacy accounting remains unchanged.

- Success: debit amount + transfer fee + duty.
- Rejection before Paystack creates the transfer: release reservation, no debit.
- Failed provider-created transfer: release principal and transfer fee; retain
  applicable stamp duty, which Paystack documents as non-refundable once applied.
- Reversal: restore principal. Retain stamp duty. Transfer fee recovery is flagged
  for reconciliation because the provider documentation does not establish a
  guaranteed fee refund on a reversal. Do not credit it without provider evidence.

After confirming the transfer fee was returned in Paystack's balance history, an
operator with service-role access can atomically return it using:

```sql
select public.finalize_fee_bearing_withdrawal(
  p_withdrawal_id := '<withdrawal UUID>',
  p_outcome := 'reversed',
  p_transfer_fee_refunded := true
);
```

Repeated reconciliation and subsequent duplicate reversal callbacks cannot debit
that refunded fee again. `fee_reconciliation_required` identifies unresolved
reversal fees; payout history displays that state. Timeout reconciliation still
requires checking the provider's reference; no new background reconciliation job
is introduced by this change.

## Validation and release

Run `deno test supabase/functions/_shared/withdrawal-fees.test.ts` for tariff
boundaries and input validation. `scripts/tests/withdrawal-fees.mjs` executes the
actual migration functions in isolated PGlite PostgreSQL; point `PGLITE_MODULE`
to an installed `@electric-sql/pglite` module. It does not access live data.

Apply migrations `20260916120000` and `20260916121000` first, then deploy
`process-salon-withdrawal`, `payment-webhook-ng` and `payment-webhook-gh`, then
release salon-admin. Until the form is updated, old clients are asked to review
the current fees instead of silently incurring undisclosed charges.

This checkout is older than the development/co-owner worktree. Reconcile the
patch into the intended release branch before deployment; don't deploy this
checkout's older payment processor over newer payment/refund work. Live transfer
verification remains necessary for both markets, including confirming actual
provider deductions and refund behavior. No real transfer was initiated during
local verification.
