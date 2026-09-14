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
- status: blocked
- checkpoint: true

The payout-split change is awaiting a go/no-go from your own testing before the superseded
subaccount/split code can be deleted. ~82 references across supabase/functions remain
(_shared/paystack-helpers.ts, payment-webhook-processor.ts, create-payment-session,
process-salon-withdrawal, retry-paystack-subaccount, and others). Blocked on your verdict — this
cannot be dispatched until you confirm the new path is safe and say which code is dead.

## booking-detail-modal-padding: Action modals have no side padding
- status: pending

Direction given by the user (2026-09-14), which unblocks the former `booking-detail-redesign` item:
the complaint is not the page, it is the action modals in
apps/client-portal/src/components/BookingActions.tsx (running-late / reschedule / cancel dialogs).
Their DialogContent has no horizontal padding or margin, so text and controls run into the sides of
the modal.

Scope is that spacing fix only. ClientBookingDetailPage.tsx itself was never the complaint and
should not be redesigned — the earlier "cosmetic pass on the page" framing was a misreading.

## payments-e2e-verification: End-to-end payments verification before beta
- status: pending
- checkpoint: true

Top-priority goal (2026-09-14, user): the product goes to beta users only once payments are proven
end to end. Covers the full path — checkout session, Paystack redirect, webhook processing
(payment-webhook-gh / payment-webhook-ng), payment recording, receipts, and payout/withdrawal —
against the dev Supabase project and Paystack test keys.

This is also the gate on `subaccount-split-cleanup`: ~82 references to the superseded payout-split
path cannot be deleted until this run produces a go/no-go verdict on the new path. The two items
are one decision.

Needs a written test plan before implementation — scope the matrix (currencies GH/NG, success,
failure, abandoned, duplicate webhook, refund) rather than ad-hoc clicking.

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
