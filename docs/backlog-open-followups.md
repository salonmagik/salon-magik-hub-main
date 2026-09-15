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

CONFIRMED GENUINELY DONE (2026-09-15, per docs/design/payout-refund-wallet-not-debited.design.md):
this item and `payout-refund-wallet-not-debited` are the same defect from two angles (UI destination
gating vs. the wallet debit itself). The gating UI, `check_refund_recoverability`, and the enforcement
RPC (`debit_salon_wallet_for_refund`, non-bypassable via `complete_transaction_refund`'s guard) landed
together on `feat/refund-card-clawback-safeguard` (commit `ffc1740`), adopted onto this branch and
corrected in this pass — see that item for the correction that was needed before it actually worked.

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

REAFFIRMED (2026-09-15, payments-e2e-verification resume pass): unchanged. The fresh verdict repeats
the same narrow "yes, unblocked" answer against a materially larger body of real evidence (Tier A now
ran against the dev project) — nothing newly evidenced implicates the split code.

## payments-e2e-verification: End-to-end payments verification before beta
- status: done (resume pass reviewed and passed 2026-09-15; verdict in
  docs/test-plans/payments-e2e.verdict.md — beta NO-GO, subaccount-split-cleanup unblocked)
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

CREDENTIALS SUPPLIED (2026-09-15, user) — no longer blocked. `supabase/functions/.env` in this
worktree (gitignored, mode 600) now holds both `sk_test_` Paystack keys, `PAYMENTS_E2E_ACK`,
`PAYMENTS_E2E_FORBIDDEN_PROJECT_REFS` (prod ref `xbkjgqaagwzxpzpiehov`), `PAYMENTS_E2E_TIER=A`, and
the dev project's `SUPABASE_URL`/anon/service-role keys (ref `yqahjtsizbqwxdbjzsli` — verified
service_role JWT, ref matches the URL, and is NOT the forbidden ref). That file is loaded by
`supabase functions serve`, NOT by `deno test`: the run must `set -a; source supabase/functions/.env;
set +a` first or the guard fails closed.

RESUME PASS COMPLETE (2026-09-15): all four steps from the note above are done — see
docs/design/payments-e2e-verification-resume.design.md and its AD-R1..AD-R6. The verdict now lives
in `docs/test-plans/payments-e2e.verdict.md` (never destroyed by a re-render); `CPT-FAIL`,
`CPT-ABD-C`, `SPT-ABD-C`, `INV-ABD-C`, `SUB-ABD-C` are closed; every `recordCell()` call site carries
`before`/`after`; Tier A ran for real against the dev project with real `sk_test_` credentials.

Along the way this pass found and fixed a harness bug that had nothing to do with credentials:
Paystack's `/transaction/initialize` rejects any email using the `.test` TLD outright (confirmed
directly against the live API) — every fixture-seeded email used `@e2e.test`, which silently blocked
every cell reaching a real Paystack call regardless of key availability. Fixed by switching to
`@e2e.example.com` (RFC 2606 reserved). This is why `PAY-BOOK-OK-*` and `PAY-TRANSPORT-*` now pass
for real where the prior run recorded them as credential-blocked.

Genuinely still unproven, and out of this pass's scope: the *initiating* Paystack calls for
`REF-a` (refund-via-paystack) and payout transfer initiation (`W-DUP-REQ`/`W-FLOOR`/`W-OTP`) were
never implemented against `paystack-test-client.ts` in this or the prior pass — the Tier A
precondition is met (a real key is present) but no call is made, so these are honestly recorded
`not-run`, not assumed passing. Tracked as its own item below
(`payments-e2e-tier-a-initiation-calls`).

Fresh verdict (docs/test-plans/payments-e2e.verdict.md): payout path and beta launch remain NO-GO —
C-3 (`payout-refund-wallet-not-debited`) is now triply-confirmed (static read, local RPC, dev-project
RPC) and is the primary blocker, no longer a coverage gap. `subaccount-split-cleanup` remains
unblocked on its own narrow question, unchanged.

## payments-e2e-tier-a-initiation-calls: Implement the actual Tier A Paystack-initiating calls the harness only gates today
- status: pending
- requires: payments-e2e-verification

Filed from the payments-e2e-verification resume pass (2026-09-15). `tier-a.ts`'s
`tierAPrecondition()`/`assertTierAWebhookReachable()` correctly gate `REF-a` (refund-via-paystack),
`PAYOUT-W-DUP-REQ`, `PAYOUT-W-FLOOR`, and `PAYOUT-W-OTP`, but none of the four actually calls
Paystack — they record `not-run` with "Tier A precondition met, but this cell is not implemented in
this pass" even when a real key is present, which is honest but leaves FR-18/FR-20 (duplicate-request
refusal, OTP) and the refund-initiation half of FR-13 permanently unevidenced until someone writes
the calls.

`W-DUP-REQ`/`W-FLOOR`/`W-OTP` are the more tractable half: `paystack-test-client.ts` already has
`initializeTransaction`/`fetchTransfer`/`fetchBalance`, and `process-salon-withdrawal` can be driven
directly (as `payout.integration.test.ts` already does for the other payout cells) with a currency's
real key present — the work is wiring a real transfer attempt through it and asserting the guard/OTP
behavior against Paystack's actual response, not inventing a new call mechanism.

`REF-a` is harder: `refund-via-paystack` needs a transaction reference Paystack itself recognizes as
completed, which requires a real hosted-checkout charge — nothing in this harness drives that without
a human at a browser (design AD-R4, "Rejected: Automate the hosted-checkout card completion"). Closing
this one likely means either accepting a manual, human-completed checkout as a one-time step per run,
or scoping it out of the harness permanently and stating that in the design.

## notification-settings-missing-per-tenant: Reminders and digest skip every tenant that never saved settings
- status: done-local (code reviewed and PASSED 2026-09-15 after a round-2 fix; NOT YET LIVE —
  the dev-project migration push and function deploy are still outstanding, see below)
- priority: next (user: "Fix", 2026-09-15 — confirmed on prod too)

CONFIRMED LIVE against dev (2026-09-15, ref yqahjtsizbqwxdbjzsli). This is the root cause of the
user's original report — `email-delivery-audit` fixed failure *visibility*, but a tenant that never
enters the loop produces no failure to make visible.

`send-appointment-reminders/index.ts` loads its work list with a bare
`select tenant_id, email_appointment_reminders, sms_appointment_reminders, reminder_hours_before
from notification_settings` and iterates the rows it gets back. No migration inserts a
`notification_settings` row per tenant, and there is no trigger on tenant creation — a row appears
only when a salon saves the notification settings page. Any tenant that never did is invisible to the
job forever. `send-daily-digest` reads the same table and has the same hole.

Evidence on dev: 8 rows in `tenants`, 1 row in `notification_settings`. The only two upcoming
scheduled appointments belong to tenants `6c3952b8-42c8-4640-a603-c8d4659e6675` and
`9211985f-d616-49b2-8891-a95bf6c8e72c`, neither of which has a settings row — which is why every
30-minute run returns `{"ok":true,"emailsSent":0,"smsSent":0,"errors":0}`. Infrastructure is
confirmed healthy and is NOT the cause: both cron jobs are registered and firing on schedule, all
four vault secrets exist with correct function URLs, `net._http_response` shows a steady stream of
200s, and the Resend domain `salonmagik.com` is verified with a valid key.

Fix shape is a design decision, not a given: either backfill a default `notification_settings` row
for every existing tenant plus a trigger on tenant creation, or change both jobs to iterate `tenants`
and left-join settings, applying documented defaults when absent. The second avoids a class of bug
where a newly created tenant is silently excluded until a backfill runs, but changes what "off by
default" means — `digest_frequency` defaults to `off` deliberately, so the digest's default must stay
opt-in while reminders' must not.

UX DECISION (2026-09-15, conductor, user asked for the call — treat as settled, do not relitigate):

- Email reminders default **on** for every tenant. A reminder about the customer's own booking is a
  service message, not marketing; withholding it is the worse outcome.
- SMS reminders default **off**. SMS consumes comms credits, so turning it on by default would spend
  a salon's money on sends it never requested. Opt-in only.
- **Two reminders per appointment by default: 24 hours before AND 30 minutes before** (user,
  2026-09-15, explicit). Do NOT change any salon's existing `reminder_hours_before` value — the
  defaults apply unless the salon has set its own.

  SCHEMA IMPLICATION, needs a design decision: the current model cannot express this.
  `reminder_hours_before` is a single integer, and the eligibility predicate keys off
  `last_reminder_sent_at is null` — so once the 24h reminder sends, the appointment leaves the query
  permanently and the 30-minute one can never fire. The per-appointment tracking columns added by
  `email-delivery-audit` (`reminder_attempt_count`, `last_reminder_attempt_at`, `reminder_failed_at`)
  are single-send shaped for the same reason. This needs per-offset state — e.g. a
  `appointment_reminder_sends` row per (appointment, offset), or explicit per-offset columns — plus a
  settings shape that holds a list of offsets rather than one integer. Whichever is chosen must keep
  the existing retry logic (max 3 attempts, never past `scheduled_start`) working per offset rather
  than per appointment.
- `digest_frequency` stays **off** by default — an internal owner report is a different consent
  question from a customer-facing reminder.
- **No throttle or suppression window on the first run.** The eligibility predicate is already
  self-bounding (`scheduled_start >= now()` within the window, so it cannot reach into the past); the
  worst case is one email per appointment in the next 24 hours, which is exactly the behaviour the
  bug has been suppressing. Delaying it would withhold correct reminders from customers whose
  appointments are imminent.
- Instead of a throttle, ship a **one-time notice in salon-admin** ("appointment reminders are now
  on", linking to the notification settings page) so an owner can see and change it before their
  customers are emailed. That addresses the real risk — an owner surprised by outbound mail — without
  penalising customers for a platform bug.

Also worth settling in the same pass: the one configured tenant has `reminder_hours_before = 2`,
so even it only catches appointments starting within 2 hours — confirm that is the intended default
rather than an artifact.

Not yet checked on prod. The same four queries should be run there before this is considered
understood: `cron.job`, `cron.job_run_details`, `net._http_response`, and the tenants vs
notification_settings row counts.


## payout-refund-wallet-not-debited: Salon wallet is not debited when a payment is refunded
- status: done-local (fixed and reviewed 2026-09-15, per
  docs/design/payout-refund-wallet-not-debited.design.md; dev-project migration push + edge function
  deploy still outstanding — awaiting the user's authorization for a direct dev-project deploy, same
  gate as notification-settings-missing-per-tenant)
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

RE-CONFIRMED (2026-09-15, payments-e2e-verification resume pass, cells PAY-BOOK-REF-b-GHS/NGN):
same defect, now reproduced against the dev Supabase project's real schema, not just the local
stack — triple confirmation (static read, local RPC call, dev-project RPC call). This is now the
verdict's primary reason for a payout-path no-go, not a coverage gap.

FIXED (2026-09-15, per docs/design/payout-refund-wallet-not-debited.design.md): adopted an existing,
complete implementation of this exact fix from an unmerged branch (`feat/refund-card-clawback-safeguard`,
commit `ffc1740`) rather than building a second one — a non-bypassable enforcement RPC
(`debit_salon_wallet_for_refund`) now debits the salon wallet *before* the irreversible external effect
on every in-product refund path (card, store-credit, offline), with `complete_transaction_refund`
refusing to record a wallet-drawing refund without proof of that debit. The adopted version debited the
*gross* refund amount, but the wallet is only ever credited net of the platform fee — at the default 0.5%
fee this blocked every full refund of a lone payment, exactly the failure `PAY-BOOK-REF-b-{GHS,NGN}`
caught. Corrected to derive the actual debit from the wallet ledger's own credit entries
(`refund_wallet_debit_amount`), never from the gross amount or the tenant's current fee setting.
Insufficient balance still blocks the refund and records `refund_block_events` (unchanged); an explicit
but unused seam (`p_allow_negative`) is left for the separate, still-open out-of-band-refund item below.
`refund-cancelled-appointment` picked up the same gross-amount bug and a second, adjacent one (a
per-appointment idempotency key that silently swallowed a second partial refund on the same
appointment) — both fixed in the same pass. `PAY-BOOK-REF-b-GHS/NGN` now record `pass` against the
local stack (`before.balance=99.5 → after.balance=0`); re-run against dev once the deploy below lands.
See the implementer report for the full account, including one deviation from the design (a guard
edge case needed a small completion beyond what the design's text specified) and the outstanding
dev-project deploy.

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

SEAM LEFT (2026-09-15, per docs/design/payout-refund-wallet-not-debited.design.md AD-N5): whoever
implements the `refund.*` handler this item needs will hit the same debit-before-effect ordering that
`payout-refund-wallet-not-debited`'s fix relies on — an out-of-band refund arrives *after* the money is
already gone, so there is nothing left to block. `debit_salon_wallet_for_refund` already has a
`p_allow_negative` parameter for exactly this (drives the balance negative, still records
`refund_block_events` as the arrears record) — unused by any caller today. The handler should call it
with `p_allow_negative := true` rather than bypassing the enforcement RPC or re-deriving its own
wallet-debit logic.

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

RE-CONFIRMED (2026-09-15, payments-e2e-verification resume pass): same three intents, same shape,
re-run against both the local stack and the dev project's real schema. Still exercised via a
directly-seeded `payment_intents` row rather than one obtained from a real `create-payment-session`
call (same documented deviation as the prior run — the processor branch under test doesn't care how
the row it reads came to exist, so this doesn't weaken the finding).

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

UNBLOCKED (2026-09-14, user): run these against the **dev** Supabase project (ref
`yqahjtsizbqwxdbjzsli`), not prod. Do NOT point any destructive step at prod.

AMENDED (2026-09-15, user): use `supabase db push`, NEVER `supabase db reset` — here and in every
future item. CI applies migrations to prod with `db push`, so the same command has to succeed on
local/dev first or the deploy is untested. `db reset` is not an acceptable substitute: it destroys
dev data (the super admin included) and, by replaying migrations into an empty database, proves
something CI never does. **If `db push` fails — ordering, a non-idempotent migration, an object
that already exists, drift — fixing the migrations so it succeeds is in scope for this item, not a
reason to fall back to reset.** That failure is the bug; it would otherwise surface during the
prod deploy.

The four test files are `begin; ... rollback;` and clean up after themselves, so they need no empty
database — only a schema current with this branch's migrations, which `db push` provides. The super
admin therefore survives by construction; if anything does drop it, re-provision via
provision-super-admin and confirm sign-in before declaring the run green.

Needs: `supabase/tests/multi_salon_owner_identity.sql` (aborts with "schema is incomplete" unless all
five new routines exist — that check is the signal `db push` worked), the `co_owner_foundation.sql`
regression, the gate-erosion audit query from the multi-salon-owner-identity design's Verification
section, and `supabase gen types typescript --project-id yqahjtsizbqwxdbjzsli` (NOT `--local`, which
targets a local stack) to refresh the four new/changed RPCs — types are stale; call sites cast around
it, consistent with ~86 pre-existing sites.

Sequencing note: `payments-e2e-verification` writes test data into this same dev project. Neither
item destroys data now that reset is off the table, but run them one at a time.
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
- status: done (code fix reviewed and passed 2026-09-15; live production verification per
  docs/email-delivery-verification-runbook.md still owed by someone with production access)

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

## backoffice-comms-tracker: Platform-wide delivery tracker for every outbound message
- status: pending
- requires: email-bounce-tracking

Requested by the user (2026-09-15) as the consolidating answer to the four gaps found by
`email-delivery-audit`. A view in **backoffice** (platform-wide, not per-salon) tracking every
outbound message by type — appointment notifications, reminders, daily digest, receipts, invitations,
password resets, waitlist/promo — showing delivered, pending, failed, and open rate where the channel
supports it, with failure reason and recipient available for triage.

Data foundation already exists: `message_logs` (provider, status, initiated_by, tenant_id) now
receives a row on both the success and failure branch of `sendResendEmail` after `email-delivery-audit`,
and `get_backoffice_comms_usage()` already aggregates it for billing. What is missing is the
distinction between *accepted by Resend* and *actually delivered/opened/bounced* — that requires
ingesting Resend webhook events, which is exactly `email-bounce-tracking`'s scope, hence the
dependency. Sent/failed counts could ship before that lands if the item is split; delivered and open
rate cannot.

Relationship to the other three gap items: `receipts-email-delivery-logging` must land for receipts to
appear in the tracker at all (that path writes no `message_logs` row today);
`email-delivery-visibility` is the salon-facing counterpart (owners seeing their own failures) and
should share the same data rather than growing a second source of truth; `cron-run-failure-alerting`
covers the job-never-ran case, which by definition produces no message row and so cannot be seen in
this tracker — the two are complementary, not overlapping.

Scope question for planning: whether SMS (Arkesel) belongs in the same view from day one, given
`message_logs` already carries both channels.

## reminder-30min-offset-not-configurable: 30-minute reminder nudge cannot be disabled independently
- status: open

Filed from `notification-settings-missing-per-tenant` (OQ-1, docs/design/notification-settings-missing-per-tenant.design.md).
`AD-2` of that design derives a tenant's reminder offsets as `[reminder_hours_before * 60, 30]` rather
than storing them, so a salon cannot currently disable the 30-minute nudge independently of its long
reminder (it can still disable all reminders per channel). If salons ask for it, the migration path
is a `reminder_offsets_minutes integer[]` column backfilled from the derivation, plus a settings-page
control. Not built.

## drop-deprecated-appointment-reminder-columns: Remove last_reminder_sent_at and friends from appointments
- status: open

Filed from `notification-settings-missing-per-tenant` (OQ-2, docs/design/notification-settings-missing-per-tenant.design.md).
`last_reminder_sent_at`, `reminder_attempt_count`, `last_reminder_attempt_at` and `reminder_failed_at`
on `appointments` became write-dead once `appointment_reminder_sends` replaced them as the reminder
eligibility/retry state (AD-3/AD-8). Drop them once the dispatch table has run a full cycle in
production, together with a `packages/supabase-client` types regeneration.

## reschedule-reminder-cycle-reset: Should rescheduling an appointment reset its reminder cycle?
- status: open (product decision, not engineering)

Filed from `notification-settings-missing-per-tenant` (OQ-3, docs/design/notification-settings-missing-per-tenant.design.md).
Today a reminder already sent for an offset is not re-sent when the appointment moves to a new
`scheduled_start`. Arguably a customer whose 3pm booking moves to Friday should be reminded again.
Out of the reported bug's scope; needs a product call before any engineering follow-up.

## appointment-reminder-sends-pruning: No retention policy for appointment_reminder_sends
- status: open

Filed from `notification-settings-missing-per-tenant` (OQ-4, docs/design/notification-settings-missing-per-tenant.design.md).
Rows accumulate at ≤2 per appointment that reaches a reminder window, with no pruning. Irrelevant at
current volume (single-digit tenants); worth a periodic delete of rows whose appointment started more
than ~90 days ago before the table gets large.

## manual-reminder-cooldown-inert: The manual "Send reminder" button no longer rate-limits
- status: pending

Raised by reviewer as an OPTIONAL finding on `notification-settings-missing-per-tenant` (2026-09-15),
and a direct, disclosed consequence of that design's AD-8 rather than an implementation mistake.
`apps/salon-admin/src/pages/salon/AppointmentsPage.tsx:1701` (`getReminderCooldownInfo`) disables the
manual "Send reminder" button for 30 minutes by reading `appointments.last_reminder_sent_at` — but
AD-8 deprecated that column platform-wide and nothing writes it any more. Confirmed by grep to be its
only remaining reader, so the cooldown is now permanently inert: an owner can click "Send reminder"
repeatedly with no rate limit, emailing the customer each time.

Fix shape is a product call: wire the cooldown to the new `appointment_reminder_sends` table, or use a
client-side debounce, or decide a manual button needs no cooldown at all.

