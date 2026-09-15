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
- status: done
- requires: co-owner-role

Investigation only, at the user's explicit request to review the design direction before anything
is implemented. Separates two conflated scenarios — branches within one business (locations /
chain plan / Business Hub) versus one identity holding owner roles at several separate `tenants`
(blocked today by `trg_enforce_single_owner_tenant`) — and establishes what actually depends on
the single-owner-per-tenant guarantee. Planner bounced it back for five commercial facts (plan
price ladder, trials/promos, per-plan allowances, how salons are created, delinquency handling);
three are answered, two remain. Brief: docs/research/2026-09-09-multi-salon-owner-identity.md.

## co-owner-invite: Invite and accept flow for a co-owner
- status: in-progress (design complete; implemented in this pipeline, pending review)
- requires: co-owner-role

Let an existing owner invite someone as a second owner, and let that person accept and get in.
Should follow the existing staff-invitation patterns (supabase/functions/send-staff-invitation),
including the temp-password onboarding convention already used for staff rather than magic links.
Covers the invite UI in salon-admin, sending, acceptance, and revoking a pending invite.

## subaccount-split-cleanup: Permanently remove the old payout-split code path
- status: pending
- checkpoint: true

UNBLOCKED (2026-09-14, payments-e2e-verification run): the run's verdict is that
subaccount-split-cleanup is unblocked on the narrow question it asks — nothing evidenced or
unevidenced in that run bears on the superseded subaccount/split code path itself (every cell ran
with `SUBACCOUNT_SPLIT_ENABLED = false`, and the two confirmed defects — duplicate-webhook
non-idempotency and refund-wallet-not-debited — are properties of the current, non-split path, not
the code being deleted). See docs/test-plans/payments-e2e.results.md "Verdict (b)". ~82 references
across supabase/functions remain (_shared/paystack-helpers.ts, payment-webhook-processor.ts,
create-payment-session, process-salon-withdrawal, retry-paystack-subaccount, and others).

## payments-e2e-verification: End-to-end payments verification before beta
- status: blocked
- checkpoint: true

Top-priority goal (2026-09-14, user): the product goes to beta users only once payments are proven
end to end. Covers the full path — checkout session, Paystack redirect, webhook processing
(payment-webhook-gh / payment-webhook-ng), payment recording, receipts, and payout/withdrawal —
against the dev Supabase project and Paystack test keys.

Test plan, cell manifest, harness, and Tier B execution are done (docs/test-plans/payments-e2e.*,
supabase/functions/_shared/payments-e2e/). BLOCKED on the user supplying real Paystack test-mode
secret keys (`PAYSTACK_SECRET_KEY_GH`, `PAYSTACK_SECRET_KEY_NG`, both `sk_test_...`) — every cell
that needs to actually call Paystack (session creation, in-product refunds, payout transfer
initiation, all of Tier A) could not run without them; see the implementer report and
docs/test-plans/payments-e2e.results.md's verdict for exactly which requirements are unevidenced
as a result. Once supplied, re-run per docs/test-plans/payments-e2e.test-plan.md's Verification
section — the harness and test plan do not need to change, only execution.

This was also the gate on `subaccount-split-cleanup`, which the same run's verdict has now
unblocked on its own narrower question (see that item) — the remaining Paystack-credential gap
here does not reopen that.

Two confirmed defects from this run, tracked separately below: `payout-refund-wallet-not-debited`
and `duplicate-webhook-not-idempotent`.

## payout-refund-wallet-not-debited: Salon wallet is not debited when a payment is refunded
- status: pending
- checkpoint: true

Confirmed live (2026-09-14, payments-e2e-verification run, cells PAY-BOOK-REF-b-GHS/NGN):
`complete_transaction_refund` (supabase/migrations/20260725000002_customer_value_and_refunds.sql)
inserts a reversing `transactions` row and marks the refund/appointment complete, but never debits
`salon_wallets` or writes a `wallet_ledger_entries` row. The wallet was credited on the original
`charge.success` via `credit_salon_purse` and is never reduced when that charge is later refunded —
a salon can withdraw money that has already been returned to the customer. Also affects
`refund-cancelled-appointment` (same underlying RPC). Payout-path concern, not a split/subaccount
one — does not block `subaccount-split-cleanup`. Beta-launch concern per
docs/test-plans/payments-e2e.results.md's verdict.

## payments-e2e-refund-webhook-unhandled: Webhook processor has no refund.* event handler
- status: pending

Static finding from payments-e2e-verification (design doc correction C-2, not independently
re-confirmed by a live cell in this run — see docs/design/payments-e2e-verification.design.md
section 2): `_shared/payment-webhook-processor.ts`'s `processWebhook` branches only on payment
success, payment failure, and transfer events — there is no `refund.processed` / `refund.pending` /
`refund.failed` branch. A refund issued directly in the Paystack dashboard (out of band) produces no
product-side record at all, and an in-product refund that Paystack later completes asynchronously is
recorded optimistically at request time and never reconciled against the final outcome. Whether an
out-of-band refund being invisible to the product is acceptable for beta salons is a business call
this backlog item does not resolve on its own (carried from the PRD as an open question).

## duplicate-webhook-not-idempotent: A duplicate charge.success delivery double-records BOOK/CPT/MSG payments
- status: pending
- checkpoint: true

Confirmed live (2026-09-14, payments-e2e-verification run, cells PAY-BOOK-DUP-*, PAY-CPT-DUP-*,
PAY-MSG-DUP-* — see docs/test-plans/payments-e2e.results.md): a byte-identical `charge.success`
webhook delivered twice (which Paystack's own retry behavior can produce) is not idempotent for
three of the six payment intents. For `appointment_payment` (BOOK) and `customer_purse_topup`
(CPT), the second delivery inserts a second `transactions` row. For `messaging_credit_purchase`
(MSG) it's worse — that branch has no idempotency key at all (unlike every other branch), so the
second delivery both inserts a second `messaging_credit_purchases` row and doubles the
`communication_credits` balance actually granted. The wallet-credit side of every intent tested
(protected by `wallet_ledger_entries`'s `(tenant_id, idempotency_key)` unique index) was correctly
idempotent in every cell — this is specifically about the transaction/invoice/purchase *records*,
not the money. `salon_purse_topup`, `invoice_payment`, and `subscription_activation` were confirmed
idempotent (no transactions row is written on those branches at all, or the code explicitly guards
on prior state). Beta-launch concern per docs/test-plans/payments-e2e.results.md's verdict.

## booking-detail-modal-padding: Action modals have no side padding
- status: pending

Direction given by the user (2026-09-14), which unblocks the former `booking-detail-redesign` item:
the complaint is not the page, it is the action modals in
apps/client-portal/src/components/BookingActions.tsx (running-late / reschedule / cancel dialogs).
Their DialogContent has no horizontal padding or margin, so text and controls run into the sides of
the modal.

Scope is that spacing fix only. ClientBookingDetailPage.tsx itself was never the complaint and
should not be redesigned — the earlier "cosmetic pass on the page" framing was a misreading.

## multi-salon-db-verification: Execute the multi-salon owner DB tests against a live Postgres
- status: pending

UNBLOCKED (2026-09-14, user): run these against the **dev** Supabase project, not prod. The user
will supply the dev URL. Dev may be emptied, with one hard constraint: **the super admin user must
survive the reset** — re-provision it (provision-super-admin) if `db reset` drops it, and confirm
it can still sign in before declaring the run green.

The earlier "needs a free local Docker stack" framing was wrong: a local stack was only ever one way
to get a disposable Postgres, and dev serves that purpose. Do NOT point any destructive step at prod.

Needs: `supabase/tests/multi_salon_owner_identity.sql`, the `co_owner_foundation.sql` regression, the
gate-erosion audit query from the multi-salon-owner-identity design's Verification section, and
`supabase gen types typescript --local` to refresh the four new/changed RPCs (types are stale; call
sites cast around it, consistent with ~86 pre-existing sites).
Review: .claudespace/s/fabf7e44-523d-44e0-8159-dd198b969ab8/reports/multi-salon-owner-identity-review.md

## backoffice-co-owner-grant-broken: backoffice-add-tenant-co-owner looks permanently broken
- status: done

Raised by principal while designing co-owner-invite, as a defect needing its own item. The function
calls `get_tenant_owners` with the service-role client (index.ts:143), but that function self-gated on
`has_backoffice_role(auth.uid(), 'super_admin')`; a service-role JWT carries no `sub`, so `auth.uid()`
was null and the gate was always false, raising BACKOFFICE_ACCESS_DENIED before any co-owner logic
ran — confirmed live against a real Supabase stack
(`docs/research/2026-09-14-backoffice-co-owner-grant-analysis.md`).

Fixed in migration `20260914120000_get_tenant_owners_service_role.sql`: `get_tenant_owners` now admits
a `service_role` caller (via `auth.role() is distinct from 'service_role'`) alongside the existing
super_admin gate, matching how the sibling `check_owner_invite_email` RPC is already granted in the
same migration. Grants no new capability — service_role already bypasses RLS. Covered by
`supabase/tests/co_owner_foundation.sql` (T-8, service-role case) and
`supabase/functions/backoffice-add-tenant-co-owner/index.integration.test.ts`, both green.

## invite-expiry-orphan-cleanup: Expired co-owner invitations leave an orphan account
- status: pending
- requires: co-owner-invite

The co-owner-invite design deletes the account it created on *revoke*, but nothing deletes on
*expiry*, because no scheduled job was in scope. Not an access problem (the invitee lands on a
terminal page), but the orphan holds an email address that then becomes permanently un-invitable.
Needs a sweeper or expiry-time cleanup.

## temp-password-entropy: generateSecurePassword uses Math.random()
- status: done

Not cryptographically secure, and it now guards owner-level credentials via the co-owner invite flow.
Reused as-is there deliberately, to avoid silently diverging the staff and owner invitation flows —
so this item should move both to crypto.getRandomValues together. Also covers the related
pre-existing gap that `send-staff-invitation` has no server-side role whitelist; only the UI has ever
prevented `role: "owner"` being sent to it.

Implemented via a shared `supabase/functions/_shared/secure-password.ts` module (crypto.getRandomValues,
rejection sampling), replacing three of the four in-repo `Math.random()` copies of the generator:
`send-staff-invitation`, `backoffice-add-tenant-owner`, and `backoffice-add-tenant-co-owner`. The latter
two were folded in during implementation planning, since both minted owner-level credentials with the
same insecure generator and were the same duplicated function this item's central act deletes. See
`docs/design/temp-password-entropy.design.md` for the full design and deferrals (existing-row audit,
migrating `provision-super-admin`/`create-backoffice-admin` onto the shared module, a `user_roles.role`
CHECK constraint).

**Known gap, deliberately not fixed here:** `send-co-owner-invitation/index.ts` still has its own local
`Math.random()`-based copy of the generator on disk in this worktree. That file is externally-authored
WIP for the separate `co-owner-invite` item ("implementation handed to Codex externally, outside this
pipeline" — see that entry below) with zero prior commits and no test coverage; it has never been
committed or deployed, so there is no live vulnerability yet. Do not commit that file as a side effect of
an unrelated change. Whoever brings `co-owner-invite` through this pipeline should apply the same fix
(delete its local generator, import `generateSecurePassword` from `_shared/secure-password.ts`) before
that file is committed for the first time.

## email-delivery-audit: Audit every outbound email path — digest and reminders are not sending
- status: implemented (code fix reviewed and passed 2026-09-15; live production verification per
  the runbook still needs to be run by someone with production access)

Raised by the user (2026-09-15): the daily digest does not send and email reminders do not work.
Those two are the known symptoms, not the scope — the item covers every outbound email the platform
sends (Resend transactional sends, scheduled/cron-driven sends, receipts, invitations, notifications),
establishing for each whether it actually reaches a recipient today, and fixing what is broken.

Investigate first: find every send path and every scheduler/trigger that is supposed to fire one,
confirm live rather than from source alone where possible, and separate "never fires" from "fires but
fails to deliver". Fix the confirmed defects. Gaps that turn out to be missing capability rather than
breakage (emails we should be sending and aren't) are to be written up and flagged to the user, and
filed as their own backlog items — not silently built here.

Implemented: `_shared/salon-notifications.ts`'s `sendResendEmail` now returns a result and writes a
`message_logs` row on both branches (previously it silently swallowed Resend failures); all 8 call
sites (10 send points) updated to act on the result; the appointment-reminders job now checks the
downstream send's response and retries a failed reminder up to 3 attempts, never past the appointment
start time; the daily digest reports per-recipient success/failure instead of an unconditional
`{ success: true }`. Design: `docs/design/email-delivery-audit.design.md`. Live verification
(FR-11 to FR-13) is `docs/email-delivery-verification-runbook.md`, not yet executed — needs production
Supabase/Resend account access nobody in this pipeline holds.

Four gaps found during this work and filed as their own items, per the original request's instruction
not to silently build missing capability: `email-delivery-visibility`, `receipts-email-delivery-logging`,
`cron-run-failure-alerting`, `email-bounce-tracking` (below).

## email-delivery-visibility: Owners have no way to see that an email failed
- status: open

Filed from `email-delivery-audit` (GAP-1, 2026-09-15). The delivery-logging fix in that item records
every email send's outcome in `message_logs`, but nothing surfaces a failure to the owner or salon —
there is no view (e.g. Settings → Notifications, or the messaging log) and no in-app notification when
a tenant's sends start failing. Explicitly deferred by that item's Planning Brief (Out of Scope: "a new
owner-facing UI for email delivery status or failure alerts").

## receipts-email-delivery-logging: `_shared/receipts.ts` reports send failures but writes no delivery record
- status: open

Filed from `email-delivery-audit` (GAP-2, 2026-09-15). `_shared/receipts.ts` defines its own local
`sendResendEmail` (not the shared helper) which already returns `{ sent, error }` and already reports
provider rejection, missing API key, and network exceptions to its callers — but it writes no
`message_logs` row on either branch, so subscription-billing email (cancellation confirmation,
dunning, payment-failed) is undiagnosable the same way the shared-helper paths were before this fix.
Out of `email-delivery-audit`'s scope because its sends are platform-billing email with different
tenant context than the operational paths that item covers. Should adopt the same `log` context
pattern (`_shared/salon-notifications.ts`'s `EmailLogContext`) once someone picks this up.

## cron-run-failure-alerting: Nothing watches for a cron job going silently no-op
- status: open

Filed from `email-delivery-audit` (GAP-3, 2026-09-15). Nothing watches `cron.job_run_details`. If a
Vault secret referenced by `send-daily-digest` or `send-appointment-reminders` is missing or wrong,
`net.http_post(url := NULL)` fails and the job is a permanent silent no-op — the exact failure mode
that item's source analysis could not rule out without live database access. Needs a periodic check
or an alert on consecutive failed runs.

## email-bounce-tracking: Resend accepting a message is not the same as delivering it
- status: open

Filed from `email-delivery-audit` (GAP-4, 2026-09-15). No bounce/complaint webhook is consumed, so
`message_logs.status` never advances past `sent` to `delivered` or `failed` for email — a message
Resend accepted but that later bounced is indistinguishable from one that actually reached the inbox.
The `delivered` status value already exists in the schema (used by SMS) and is simply unused for
email today.
