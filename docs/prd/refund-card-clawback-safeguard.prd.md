# Original Request

> Gate the "refund to card" option on whether the money is actually still recoverable.
>
> The refund destination picker in apps/salon-admin/src/components/dialogs/RequestRefundDialog.tsx
> (around lines 296-324) always offers "Back to the customer's card via Paystack" for card
> payments. Its only caveat is UI copy - "Not always possible - depends on Paystack's own
> settlement state" - with no actual check behind it. Since payouts moved to on-demand withdrawal
> (supabase/migrations/20260906160000_payout_mode_on_demand_only.sql), a salon that has already
> withdrawn those funds leaves Salon Magik absorbing the refund with no way to claw it back.
>
> Investigate what actually determines recoverability - Paystack settlement/refund state, the
> withdrawal ledger, and how gateway funds are marked withdrawable (see
> supabase/functions/_shared/payment-webhook-processor.ts around line 634) - and what the refund
> paths currently do: supabase/functions/refund-via-paystack and
> supabase/functions/refund-cancelled-appointment. The safeguard must be backend-enforced, not
> just UI gating.

Backlog item: `docs/backlog-open-followups.md` → `refund-card-safeguard`
Upstream research: `docs/research/2026-09-06-refund-clawback-safeguard.md`

---

# Summary

When a salon refunds a customer's card, Salon Magik pays the customer back out of its own Paystack
settlement balance and expects to recover that money from the salon's internal wallet. Today it
never checks whether that wallet still holds the money. If the salon has already withdrawn it —
which on-demand withdrawal makes easy and common — the refund goes through anyway and Salon Magik
absorbs the loss permanently, with no ledger entry recording that it happened.

The internal store-credit refund path already gets this right: it debits the salon's wallet first
and refuses the whole refund if the balance can't cover it. This feature extends that same
guarantee to the card-refund path, and makes the resulting availability visible to salon staff
before they pick a refund destination rather than as a failure after they submit.

The rule this feature establishes: **Salon Magik never moves money to a customer that it cannot
simultaneously recover from the salon.**

---

# Problem Statement

A card refund can be issued for money the salon has already taken out of the platform. Nothing
blocks it, nothing warns anyone, and nothing records the shortfall — so the loss is both
unpreventable and invisible. It is discovered, if at all, only by manually reconciling Paystack
settlements against the internal wallet ledger.

Separately, salon staff are shown a refund destination ("back to the customer's card") that may be
impossible to honour, with only vague copy hedging it. Staff commit to an outcome in front of a
customer without knowing whether it can actually happen.

---

# Business Goal

- Stop uncontrolled, unrecorded revenue loss from unrecoverable card refunds. Every naira Salon
  Magik pays a customer must be backed by a matching debit against the salon that owes it.
- Make refund losses that do occur visible and attributable, instead of silently absorbed.
- Reduce support burden: staff and customers learn a refund is unavailable before it is promised,
  not after it has failed.

---

# User Goal

**Salon owner / manager:** when refunding a customer, I want to see which refund destinations are
actually available for this payment, and be told plainly why one isn't, so I can promise the
customer something I can deliver.

**Salon Magik platform staff:** I want a record of every refund attempt that was blocked because
the salon had already withdrawn the funds, so I can follow up with that salon and understand our
exposure.

---

# Scope

1. **Backend enforcement on the card-refund path.** A card refund must not reach Paystack unless
   the salon's wallet can cover the full refund amount at that moment. The check and the wallet
   debit are backend-enforced and are the sole source of truth; no UI state can bypass them.
2. **Correct ordering.** The recoverability check and the salon-side debit happen *before* the
   irreversible external refund. If the salon cannot cover it, the customer's card is never
   touched.
3. **All-or-nothing coverage.** A refund is either fully covered by the salon's wallet or blocked.
4. **Parity across refund paths.** The same guarantee applies to every path that returns money to
   a customer — card refunds and internal store-credit/cancellation refunds alike. The
   cancellation path already enforces it; this feature confirms and preserves that parity so the
   two paths cannot diverge again.
5. **Ledger record of the debit.** A successful card refund leaves a wallet ledger entry
   attributing the refund to the salon, the same way internal refunds already do, so the money
   trail is complete.
6. **Blocked attempts are recorded.** When a refund is blocked for insufficient recoverable funds,
   the attempt is recorded with its reason so platform staff can see it after the fact.
7. **Refund destination availability in the UI.** The refund destination picker reflects the
   backend's answer: an unavailable card option is shown as unavailable, with a plain-language
   reason ("this salon has already withdrawn this payment"), before the user commits. Vague
   "not always possible" copy is replaced by the real reason.
8. **Clear failure surface.** If the backend blocks a refund at submit time (e.g. balance changed
   between opening the dialog and submitting), the user sees a specific, actionable message —
   not a generic error.

---

# Out of Scope

- **Negative wallet balances, salon debt, or arrears collection.** Salon Magik will not extend
  credit to a salon to fund a refund. No debt construct is introduced.
- **Partial or split refunds** (debit what's available, record the rest as a shortfall).
- **Automated recovery of already-incurred losses**, and any backfill or reconciliation of
  historical unrecoverable refunds that already happened before this feature ships.
- **Withholding, delaying, or reserving salon withdrawals** against possible future refunds
  (e.g. a refund-window hold on recently-paid bookings). This would prevent the problem earlier
  but changes the payout promise made to salons; it is a separate decision.
- **A platform-staff override** to force a card refund through despite insufficient balance.
- **Changes to how booking payments credit the salon wallet**, to platform fee handling, to
  withdrawal mechanics, or to over-refund protection on a single transaction (already enforced).
- **Paystack's own refund-window and settlement rules.** Those remain Paystack's to enforce; this
  feature adds Salon Magik's recoverability rule on top and does not attempt to predict Paystack's.
- **Customer-facing notification of a blocked refund.** Communication stays with salon staff.

---

# Functional Requirements

1. A card refund request is rejected before any external refund is issued if the salon's wallet
   balance is less than the full refund amount at the moment of the request.
2. When a card refund is permitted, the salon's wallet is debited by the full refund amount as
   part of the same operation, and the debit is recorded in the wallet ledger attributed to that
   refund.
3. If the external card refund fails after the salon's wallet has been debited, the salon must not
   be left debited for money the customer never received; the system resolves to a state where
   the ledger reflects what actually happened.
4. The rejection in FR-1 occurs regardless of how the refund was initiated (direct refund,
   approval queue, or any future caller). No client, role, or entry point can bypass it.
5. A refund blocked by FR-1 makes no change to the customer's balance, the transaction record's
   refunded state, or the appointment's payment status.
6. A refund blocked by FR-1 is recorded as a blocked attempt, capturing at minimum: the
   transaction, the salon, the attempted amount, the wallet balance at the time, the reason, who
   attempted it, and when.
7. Store-credit and cancellation refunds continue to be rejected when the salon's wallet cannot
   cover them, with the same all-or-nothing rule and the same recorded outcome as FR-6.
8. Before a user selects a refund destination, the refund dialog indicates whether the card
   destination is currently available for that specific payment, based on a backend answer, not a
   client-side guess.
9. When the card destination is unavailable, the dialog states the reason in plain language and
   does not allow that destination to be selected.
10. When a refund is blocked at submit time, the user is shown a message that names the reason
    (funds already withdrawn by the salon) and distinguishes it from other refund failures such as
    Paystack declining the refund.
11. Any refund destination that remains available when the card destination is blocked continues
    to work unchanged.
12. Refund amounts, currency, and over-refund limits behave exactly as they do today; this feature
    adds a rejection condition and does not relax any existing one.

---

# Non-functional Requirements

- **Correctness under concurrency:** the balance check and the debit must be a single indivisible
  decision. A withdrawal and a refund racing on the same wallet must never both succeed against
  the same funds.
- **Idempotency:** a retried refund request must not debit the salon twice or refund the customer
  twice.
- **Auditability:** for any completed card refund, it must be possible to show which wallet debit
  covered it; for any blocked one, why it was blocked.
- **Usability:** availability in the refund dialog resolves quickly enough that it does not make
  the dialog feel slow; if it cannot be determined, the safe behaviour is to let the backend
  decide at submit rather than to silently offer an unavailable option as available.
- **No silent absorption:** there must be no code path where Salon Magik pays a customer and no
  corresponding record exists of who owes that money.

---

# User Flow

**Happy path — funds still recoverable**
1. Owner opens a paid, card-funded booking and chooses to refund the customer.
2. The refund dialog shows "back to the customer's card" as available.
3. Owner confirms the refund.
4. The salon's wallet is debited, the customer's card is refunded, the transaction and appointment
   are marked refunded, and the owner sees confirmation.

**Blocked path — salon already withdrew the money**
1. Owner opens the same dialog for a payment whose funds have already been withdrawn.
2. The card destination is shown as unavailable, with the reason: this payment has already been
   paid out to the salon.
3. Owner picks another available destination, or cancels and handles it off-platform.
4. Nothing is charged back to Salon Magik; the blocked attempt is recorded.

**Race path — balance changes mid-flow**
1. Owner opens the dialog while the card option is available.
2. A withdrawal completes before the owner confirms.
3. Owner confirms; the backend rejects the refund.
4. Owner sees a specific message explaining the funds were withdrawn, and no refund is issued.

**Platform staff**
1. Staff review blocked refund attempts and see which salons have refunds outstanding against
   funds they have already withdrawn, for manual follow-up.

---

# Constraints

- Salon Magik funds card refunds from its own settlement balance; the platform is exposed for the
  full amount at the moment the refund is issued. This is a fact of the payment arrangement, not
  something this feature can change.
- Salons are entitled to withdraw their balance on demand; this feature must not silently make
  withdrawn money reclaimable or delay payouts.
- A blocked refund is a real customer-facing consequence — a customer who is legitimately owed
  money may not get it back to their card. The product accepts this outcome for this phase in
  exchange for stopping uncontrolled loss; it is why FR-6's record and the platform-staff view
  matter.
- Existing refund limits (never refund more than was paid) remain binding.

---

# Assumptions

- The salon's internal wallet balance is the authoritative answer to "is this money still
  recoverable." Paystack's settlement state does not determine recoverability for Salon Magik,
  because booking payments credit the salon's wallet immediately and unconditionally at payment
  time. (Established as fact in the research brief.)
- Blocking a card refund does not automatically make a store-credit refund succeed: store credit
  is funded from the same wallet, so if the wallet is empty, that path is blocked too. Staff may
  therefore be left with no automated option, which the flow above accounts for.
- Salons will occasionally be told a refund cannot be issued. The support cost of that is lower
  than the cost of absorbing the refunds.

Decisions made autonomously (`--think`), each reversible on its own:

- `Q: Should the fix hard-block the Paystack refund entirely when the wallet balance is
  insufficient, or allow it and record a debt/negative balance for manual recovery? -> A:
  Hard-block. A debt construct is a new financial product — it needs terms, arrears policy, and a
  collections path, none of which exist, and an uncollectable debt row is the same loss with more
  machinery around it. Blocking is the smallest change that fully closes the leak, and it matches
  the rule the cancellation-refund path already enforces. Manual recovery stays a human process,
  made possible by the recorded blocked attempt (FR-6). (decided autonomously)`
- `Q: If the wallet is partially covered, should the refund be blocked, capped to the available
  balance, or split with a recorded shortfall? -> A: Blocked, all-or-nothing. A capped refund
  silently gives the customer less than they are owed without anyone deciding to; a split creates
  the shortfall/debt construct rejected above. All-or-nothing is also the existing semantics of
  every wallet debit in the system, so it introduces no new rule. (decided autonomously)`
- `Q: Should platform staff be able to override the block and force the refund through? -> A: Not
  in this phase. An override is exactly the loss this feature exists to prevent, and adding it
  before there is any data on how often blocking actually hurts would make it the default escape
  hatch. Revisit once blocked-attempt volume is known. (decided autonomously)`
- `Q: Should the UI availability check be relied on, given the backend enforces the rule anyway?
  -> A: Yes, as information only. The backend is the guarantee; the UI check exists so staff do
  not promise a customer a refund that will fail. If the UI check cannot resolve, the flow falls
  through to backend enforcement rather than blocking optimistically. (decided autonomously)`

---

# Risks

- **Customer-experience risk:** a customer legitimately owed a refund is told it cannot be issued
  to their card, and may have no automated alternative. This is the deliberate trade-off above;
  the blocked-attempt record is the mitigation, and volume should be watched after launch.
- **Support-load shift:** blocked refunds create support conversations that previously did not
  happen (because the refund silently succeeded at Salon Magik's expense). Expect a rise in
  refund-related tickets even as losses fall.
- **Salon-trust risk:** salons may perceive the block as Salon Magik withholding a customer's
  refund. Messaging must make clear the money has already been paid to the salon.
- **Incentive risk:** a salon that learns withdrawals block refunds could withdraw aggressively to
  avoid refunding customers. Blocked-attempt data makes this detectable; deterring it (holds,
  reserves) is out of scope here.
- **Under-measurement risk:** losses already incurred before launch remain invisible, so early
  reporting will understate historical exposure.

---

# Open Questions

- What should salon staff be told to do when *no* refund destination is available — is there an
  approved off-platform process (bank transfer by the salon, settlement against the next
  withdrawal), or does this escalate to Salon Magik support? This affects UI copy only, not
  enforcement, so it does not block delivery.
- Where should platform staff see blocked refund attempts, and does anyone need to be actively
  notified when one occurs, or is after-the-fact review enough for this phase?

---

# Acceptance Criteria

1. **Given** a card payment whose salon wallet balance is at least the refund amount, **when** an
   owner issues a card refund, **then** the customer's card is refunded, the salon's wallet is
   debited by the same amount, and a ledger entry links the debit to that refund.
2. **Given** a card payment whose salon has already withdrawn the funds, **when** an owner issues a
   card refund, **then** no external refund is issued, the customer's card is not credited, and
   the request fails with a reason identifying insufficient recoverable funds.
3. **Given** the same blocked refund, **when** the attempt completes, **then** the transaction is
   not marked refunded, the appointment's payment status is unchanged, the customer's balance is
   unchanged, and the salon's wallet balance is unchanged.
4. **Given** a blocked refund attempt, **when** platform staff review blocked attempts, **then**
   they can see the salon, transaction, attempted amount, balance at the time, reason, actor, and
   timestamp.
5. **Given** a salon wallet holding less than the full refund amount but more than zero, **when** a
   card refund is attempted, **then** it is blocked in full and no partial refund or partial debit
   occurs.
6. **Given** a card payment whose funds have been withdrawn, **when** an owner opens the refund
   dialog, **then** the card destination is presented as unavailable with a plain-language reason
   and cannot be selected.
7. **Given** a card payment whose funds are still recoverable, **when** an owner opens the refund
   dialog, **then** the card destination is presented as available and selectable.
8. **Given** a refund dialog opened while the card option was available, **when** the wallet is
   emptied by a withdrawal before the owner confirms, **then** the refund is rejected at submit
   and the owner sees a message naming the withdrawn-funds reason, distinct from a Paystack
   decline.
9. **Given** a refund attempt initiated from any entry point other than the refund dialog, **when**
   the salon's wallet cannot cover it, **then** it is rejected on the same terms as AC-2.
10. **Given** a store-credit or cancellation refund on a salon whose wallet cannot cover it,
    **when** it is attempted, **then** it is rejected and no customer credit is issued.
11. **Given** the same refund request submitted twice (retry or duplicate), **when** both are
    processed, **then** the salon is debited at most once and the customer is refunded at most
    once.
12. **Given** a withdrawal and a card refund submitted concurrently against a wallet that can
    cover only one, **when** both are processed, **then** exactly one succeeds and the wallet
    balance never goes negative.

---

# Success Criteria

- **Zero unrecoverable card refunds.** After launch, every completed card refund has a matching
  salon wallet debit — measured by reconciling completed card refunds against wallet ledger
  entries; the target is no unmatched refunds.
- **Loss exposure becomes measurable.** The total value of blocked refund attempts is reportable,
  giving a running figure for loss avoided that previously could not be counted at all.
- **No wallet integrity regressions:** no negative salon wallet balances and no double-debits
  attributable to refunds.
- **Bounded support cost:** refund-related support contacts rise no more than proportionally to
  blocked-attempt volume, and blocked attempts do not trend upward over time (which would signal
  the incentive risk above materialising).
- **Staff are not surprised:** the share of refund failures that occur at submit time rather than
  being shown as unavailable up front stays low — most blocked refunds should be visible in the
  dialog before the user commits.
