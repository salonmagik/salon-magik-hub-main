# Backlog: Open follow-ups — refund safeguard, co-owner support, payout-split cleanup, booking-detail redesign

## refund-card-safeguard: Gate "refund to card" on whether the money is still recoverable
- status: done
- checkpoint: true

The refund destination picker (apps/salon-admin/src/components/dialogs/RequestRefundDialog.tsx)
always offers "Back to the customer's card via Paystack" for card payments, with no check on
whether Salon Magik can still recover those funds. Since payouts moved to on-demand withdrawal
(supabase/migrations/20260906160000_payout_mode_on_demand_only.sql), a salon that has already
withdrawn the money leaves the platform absorbing the refund. Needs a real eligibility check —
backend-enforced, not just UI copy — covering both refund-via-paystack and
refund-cancelled-appointment.

## co-owner-role: Support a second owner on a salon
- status: done
- checkpoint: true

There is currently no concept of a co-owner anywhere in the schema or role checks — only the
single tenant owner created via backoffice-add-tenant-owner. This item covers the data model and
permission foundation: letting a salon have more than one owner-level account, and making every
owner-gated check (RLS, edge functions, salon-admin UI) treat them equivalently. No invite flow
yet — that is the next item.

## multi-salon-owner-identity: Establish how one person spanning several salons should be modelled
- status: in-progress
- requires: co-owner-role

Investigation only, at the user's explicit request to review the design direction before anything
is implemented. Separates two conflated scenarios — branches within one business (locations /
chain plan / Business Hub) versus one identity holding owner roles at several separate `tenants`
(blocked today by `trg_enforce_single_owner_tenant`) — and establishes what actually depends on
the single-owner-per-tenant guarantee. Planner bounced it back for five commercial facts (plan
price ladder, trials/promos, per-plan allowances, how salons are created, delinquency handling);
three are answered, two remain. Brief: docs/research/2026-09-09-multi-salon-owner-identity.md.

## co-owner-invite: Invite and accept flow for a co-owner
- status: pending
- requires: co-owner-role

Let an existing owner invite someone as a second owner, and let that person accept and get in.
Should follow the existing staff-invitation patterns (supabase/functions/send-staff-invitation),
including the temp-password onboarding convention already used for staff rather than magic links.
Covers the invite UI in salon-admin, sending, acceptance, and revoking a pending invite.

## subaccount-split-cleanup: Permanently remove the old payout-split code path
- status: blocked
- checkpoint: true

The payout-split change is awaiting a go/no-go from your own testing before the superseded
subaccount/split code can be deleted. ~82 references across supabase/functions remain
(_shared/paystack-helpers.ts, payment-webhook-processor.ts, create-payment-session,
process-salon-withdrawal, retry-paystack-subaccount, and others). Blocked on your verdict — this
cannot be dispatched until you confirm the new path is safe and say which code is dead.

## booking-detail-redesign: Cosmetic pass on the customer booking-details page
- status: blocked

The customer-facing view/pay/reschedule page (apps/client-portal/src/pages/ClientBookingDetailPage.tsx
plus components/BookingActions.tsx) is functionally correct; only its appearance is in question.
Blocked on direction — no specific complaints or target look have been stated, and inventing a
redesign brief would be guessing at scope.
