# Original Request

> End-to-end payments verification before beta (top-priority, user-set 2026-09-14). The product
> ships to beta users only once payments are proven end to end, against the DEV Supabase project
> and Paystack TEST keys — never prod. Cover the full path: checkout session creation, Paystack
> redirect, webhook processing (payment-webhook-gh / payment-webhook-ng), payment recording,
> receipts, and payout/withdrawal. A written test plan comes before any implementation: scope the
> matrix explicitly — currencies GH and NG, success, failure, abandoned, duplicate webhook, refund
> — rather than ad-hoc clicking. This run must end in an explicit go/no-go verdict on the new payout
> path, because that same verdict is the gate on subaccount-split-cleanup (~82 references to the
> superseded subaccount/split code cannot be deleted until it lands); the two items are one
> decision.

Backlog item: `payments-e2e-verification` (`docs/backlog-open-followups.md`), status `in-progress`,
checkpoint item, gating `subaccount-split-cleanup`.

Input: the Technical Brief for this item, `docs/research/2026-09-14-payments-e2e-verification.md`.

---

# Summary

Money is the one thing this product cannot get wrong, and today nobody can say whether it works.
There is no e2e coverage of the payment path at all — only narrow unit tests with mocked clients —
so the current confidence in checkout, webhook recording, receipts and payouts is based on reading
code, not on having watched a real payment move.

This item produces three things, in order:

1. **A written, persisted test plan** covering the full money path in both currencies, with an
   explicit scenario matrix (success, failure, abandoned, duplicate webhook, refund) and a stated
   expected result per cell — so "passing" is defined before anything is run.
2. **An executed run of that plan** against the DEV Supabase project and Paystack TEST keys, with
   every cell recorded as pass / fail / not-applicable and evidence attached.
3. **An explicit go/no-go verdict on the payout path**, written down as a decision with reasons.
   That single verdict is also the gate on `subaccount-split-cleanup` and on beta launch.

Research already established one verified defect that this plan must confirm rather than discover:
a repeated `charge.success` delivery for a booking payment is **not** idempotent end-to-end — only
the salon wallet credit is protected. A duplicate delivery would double-count the payment against
the appointment, write a second transaction, issue a second invoice and re-send receipt emails.
Confirming and quantifying this is in scope; fixing it is not (see Out of Scope).

Everything here is product behaviour and evidence requirements. How the plan is executed — harness,
simulated webhook delivery, fixtures — is an engineering decision for the next stage.

---

# Problem Statement

Beta cannot launch because nobody can demonstrate that a customer's payment reliably becomes a
recorded payment, a receipt, and eventually money in the salon's bank account. Three separate
things are blocked on the same missing evidence:

- **Beta launch.** The user has set payments-proven-end-to-end as the hard gate.
- **`subaccount-split-cleanup`.** ~82 references to the superseded subaccount/split payout path
  cannot be deleted until the replacement payout path is declared sound.
- **Trust in the ledger.** The salon wallet is credited immediately on payment success, but a
  known duplicate-webhook gap means the recorded amount can diverge from what was actually charged,
  and no one currently knows whether that has ever happened.

Ad-hoc clicking through checkout has been the only verification method so far. It cannot cover
failure, abandonment, duplicate delivery or refund, and it produces no durable evidence.

---

# Business Goal

Unblock beta launch with a defensible, written basis for saying payments work — and unblock the
removal of a large dead payout code path that is currently costing maintenance on every change to
payments. A wrong answer here is expensive in both directions: shipping a broken money path damages
salon trust irrecoverably at the exact moment we are asking them to rely on us for revenue, while
withholding beta indefinitely on unexamined doubt costs launch time.

---

# User Goal

Two real users sit behind this:

- **A salon's customer** wants to pay for a booking and immediately receive a correct receipt,
  and to be charged exactly once even if the network, their browser, or Paystack misbehaves.
- **A salon owner** wants every payment taken on their behalf to appear in their records and their
  wallet at the correct amount, and wants to withdraw that money to their bank with confidence that
  the amount shown is the amount they will get, and that a failed transfer costs them nothing.

The internal consumer of this work is the team, who needs a single written verdict they can act on.

---

# Scope

- A persisted test plan document covering the full money path, with every scenario stated as
  expected observable outcome (what the customer sees, what the salon sees, what is recorded),
  not as steps alone.
- Coverage of both currencies independently: GH and NG are separate Paystack accounts and must each
  be exercised. No cell may be marked passing in one currency on the strength of the other.
- Coverage of the checkout entry points that take real money today: booking payment (including
  guest checkout and outstanding-balance payment), customer purse top-up, salon purse top-up,
  invoice payment, messaging credit purchase, and subscription activation.
- The scenario matrix, per currency, per applicable intent: **success**, **failure** (declined
  card), **abandoned** (customer never returns from the hosted checkout page), **duplicate webhook**
  (the same payment-success event delivered more than once), and **refund**.
- Verification that the authoritative path works when the browser redirect never happens — the
  abandoned-return case must be tested deliberately, not assumed.
- Receipt/notification verification: for each success case, confirm the customer receipt and the
  owner/manager notification are sent exactly once with correct amount and currency.
- Payout/withdrawal coverage: successful withdrawal, failed transfer, reversed transfer, duplicate
  withdrawal request, withdrawal exceeding available (unsettled) balance, and the OTP-required case.
- A check that a withdrawal held for OTP does not present to the salon as a silently stuck payout.
- Execution of the plan against the DEV Supabase project with Paystack TEST keys, recording
  pass/fail/N-A plus evidence per cell.
- A written **go/no-go verdict on the payout path**, with reasons, explicitly stating whether
  `subaccount-split-cleanup` is thereby unblocked and whether beta is thereby unblocked.
- A written list of any defects found, each raised as its own backlog item and Jira ticket under
  the payments epic, so that nothing found here is carried only inside this document.

---

# Out of Scope

- **Fixing the known duplicate-webhook gap.** It is a confirmed defect with a known shape; this run
  confirms and quantifies its real-world impact, and raises it as its own item. Repairing payment
  recording is a change to the money path and must not ride along inside the run that is supposed to
  be independently verifying that path.
- **Fixing any other defect found.** Same reasoning: findings are recorded and ticketed, not patched
  mid-run.
- **Deleting the subaccount/split code.** That is `subaccount-split-cleanup`, a separate item that
  this verdict unblocks.
- **Re-enabling subaccount splits.** The path under test is the current non-split, wallet-based
  payout path. Whether splits are ever re-enabled is a separate decision.
- **Anything against production.** No test, diagnostic, credential, or data step may target the prod
  Supabase project or Paystack live keys, under any circumstance.
- **Performance, load, or concurrency testing** of the payment path.
- **Building permanent automated regression coverage** for payments. Whatever harness this run needs
  is justified on its own; committing to an ongoing CI e2e payments suite is a separate decision.
- **Subscription billing reliability** (unbilled-subscription risk) beyond the subscription
  activation charge itself — that is covered by the existing subscriptions/billing work.

---

# Functional Requirements

**Test plan document**

1. The test plan is persisted as a document in the repository before execution begins.
2. The plan states, for every matrix cell, the expected observable outcome in three places: what the
   paying customer sees, what the salon sees, and what is recorded against the payment.
3. The plan states explicitly which cells are not applicable to which intent types, and why.
4. The plan states the pass/fail criterion for each cell in terms that do not require judgement at
   execution time.
5. The plan names the environment constraints (DEV Supabase, Paystack TEST keys) and states that
   production is out of bounds.

**Checkout and payment recording**

6. For each currency (GH, NG) and each in-scope intent type, a successful payment results in exactly
   one recorded payment of the correct amount and currency.
7. A successful booking payment moves the appointment to the correct payment status and correct
   paid-amount, with no residual balance discrepancy.
8. A successful payment results in exactly one customer receipt and exactly one owner/manager
   notification, each showing the correct amount and currency.
9. A declined/failed payment leaves the appointment, the salon wallet and the records unchanged, and
   does not send a receipt.
10. An abandoned checkout — where the customer never returns from the hosted checkout page — still
    records the payment correctly if the charge in fact succeeded, without depending on the browser
    returning.
11. An abandoned checkout where no charge occurred leaves no partially-recorded payment behind.
12. A duplicate delivery of the same payment-success event does not change any recorded amount,
    does not produce a second receipt or notification, and does not credit the salon twice. Current
    behaviour is known to violate this; the run records the actual observed outcome against this
    requirement rather than skipping the cell.
13. A refund (or, if no refund capability exists in the product today, the absence of one) is
    recorded as an explicit finding stating what a salon can and cannot do when a customer must be
    refunded.
14. A payment attempt in a currency that does not match the salon's own currency is refused.
15. A payment session cannot be created for a booking that is already fully paid or refunded.

**Payout / withdrawal**

16. A salon owner can request a withdrawal to a verified destination and, on transfer success, sees
    the withdrawal complete and the wallet reduced by exactly the withdrawn amount, once.
17. A failed or reversed transfer leaves the salon's wallet balance unchanged — the owner is not
    debited for money they never received.
18. A duplicate withdrawal request (same amount, same destination, in quick succession) is refused
    rather than producing two transfers.
19. A withdrawal request exceeding the salon's settled/available balance is refused with a reason
    the owner can act on, even when the raw wallet balance appears sufficient.
20. A withdrawal that Paystack holds for OTP is not presented to the salon as a completed or a
    failed payout, and does not appear as a silently stuck item with no explanation.
21. Duplicate delivery of a transfer-success event does not debit the wallet twice.

**Verdict and follow-up**

22. Every matrix cell is recorded as pass, fail, or not-applicable, with evidence, and no cell is
    left unrun without a written reason.
23. The run produces a written go/no-go verdict on the payout path, stating the decision, the
    evidence it rests on, and any conditions attached to a "go".
24. The verdict explicitly states whether `subaccount-split-cleanup` is unblocked and whether beta
    launch is unblocked.
25. Every defect found is raised as its own backlog item with a Jira ticket under the payments epic,
    with severity relative to beta launch stated.
26. The backlog item `payments-e2e-verification` is updated to reflect the outcome, and
    `subaccount-split-cleanup` is updated with the verdict's consequence for it.

---

# Non-functional Requirements

- **Safety.** No step in the plan may touch production data or live Paystack keys. Any step that
  could, must be called out in the plan as prohibited.
- **Reproducibility.** A second person following the written plan must be able to reach the same
  result without asking questions. Cells whose outcome depends on manual timing or luck must be
  identified as such.
- **Evidence.** A pass claim is backed by recorded evidence, not by recollection. A cell cannot be
  marked pass on the basis of code reading alone.
- **Traceability.** Each matrix cell maps to a stated functional requirement above, so the verdict
  can be read against what was asked for.
- **Correctness over completeness.** If a cell cannot be exercised honestly in the dev/test
  environment, it is marked not-applicable with the reason, never marked pass by inference.

---

# User Flow

**Customer paying (the path under test)**

1. A customer books or is asked to settle an outstanding balance, and chooses to pay.
2. They are taken to Paystack's hosted checkout in their salon's currency.
3. They pay successfully → they are returned to the product, see confirmation, and receive a
   receipt. The salon owner is notified and the amount appears in the salon's records and wallet.
4. Or the payment fails → they see a clear failure, nothing is recorded, no receipt is sent, and
   they can try again.
5. Or they abandon the page / lose their connection → if the charge actually went through, the
   payment is still recorded correctly and the receipt still arrives without them returning. If it
   did not, nothing is left half-recorded.

**Salon owner getting paid (the path the verdict is about)**

1. The owner opens Payouts and sees their available balance.
2. They request a withdrawal to their verified destination.
3. The request is refused if it duplicates a recent one, or exceeds what has actually settled.
4. On success, the transfer completes and their balance drops by exactly that amount, once.
5. On failure or reversal, they are told, and their balance is untouched.

**The team running this item**

1. Write the test plan and persist it.
2. Execute every cell against DEV + test keys, recording result and evidence.
3. Write the go/no-go verdict.
4. Raise a ticket for every defect found; update both backlog items.

---

# Constraints

- Dev Supabase project and Paystack TEST keys only. Production is off-limits for every step of this
  work — this is a hard business constraint, not a preference.
- GH and NG are commercially separate Paystack accounts; evidence from one does not constitute
  evidence for the other.
- The plan must be written and persisted before execution starts. An executed-first,
  documented-after run does not satisfy this item.
- Beta launch waits on this verdict; so does `subaccount-split-cleanup`. The verdict must be a
  single decision serving both, not two hedged statements.
- Every defect found gets its own Jira ticket under the payments epic, per the project's
  one-ticket-per-work-item convention.

---

# Assumptions

- `Q: Is the deliverable the written test plan only, or the plan plus its execution plus the
  verdict? -> A: All three. The request says the plan "comes before any implementation" and that the
  run "must end in an explicit go/no-go verdict" — a plan alone unblocks nothing, and the verdict
  cannot be issued without execution. (decided autonomously)`
- `Q: Should the known duplicate-webhook gap be fixed as part of this run? -> A: No. It is confirmed
  and quantified here and raised as its own item with its own ticket. A run whose purpose is to
  independently verify the money path must not also be changing the money path; and the gap is on
  the charge-recording side, not the payout path the verdict is about. It is expected to be a
  beta blocker in its own right, which the verdict should say plainly. (decided autonomously)`
- `Q: Does a refund capability exist in the product today? -> A: Unknown from the research brief,
  which describes no refund path. The refund matrix cell is therefore specified as "establish and
  record what a salon can do when a customer must be refunded" — a finding, which may legitimately
  be "there is no in-product refund path", rather than a pass/fail of an assumed feature. (decided
  autonomously)`
- `Q: Which intent types must be covered, or is booking payment enough? -> A: All intents that move
  real money today (booking payment, customer purse top-up, salon purse top-up, invoice payment,
  messaging credit purchase, subscription activation), because they share one recording path and a
  defect in it would surface on any of them. Full matrix depth (all five scenarios) is required for
  booking payment; other intents may reasonably be narrower where a scenario is not applicable, which
  the plan must state explicitly rather than silently omit. (decided autonomously)`
- `Q: Must the verification be automated, or is a manual run acceptable? -> A: Product-neutral —
  what matters is that results are reproducible and evidenced, which is requirement-level. Whether
  that is achieved by a harness or by a careful manual run is an engineering decision for the next
  stage. (decided autonomously)`
- `Q: Should this run also build lasting CI regression coverage for payments? -> A: No. Out of scope;
  a standing e2e payments suite is a separate commitment with its own cost, and bundling it would
  delay the verdict that beta is waiting on. (decided autonomously)`
- `Q: If the verdict on payouts is "go" but charge-side defects are found, is beta unblocked?
  -> A: The two are separable and the verdict must say so explicitly: a payout "go" unblocks
  subaccount-split-cleanup on its own, while beta launch additionally requires the charge-side
  defects to be resolved. Conflating them would either hold back a cleanup that is ready or ship a
  beta that isn't. (decided autonomously)`
- Assumed fact: the dev Supabase project and Paystack test credentials for both GH and NG are
  available to whoever executes this. If NG or GH test credentials turn out to be missing, that
  currency's cells cannot be marked pass and the verdict must state the gap — it is not grounds for
  generalising from the other currency.

---

# Risks

- **A false "go".** Marking cells pass by inference, or on one currency only, produces a verdict
  that reads as assurance while carrying the same risk into beta. This is the most expensive
  failure mode here and the reason for the evidence requirement.
- **A hedged verdict.** If the run ends in "mostly fine, some concerns", neither beta nor
  `subaccount-split-cleanup` moves, and the item has cost time without producing its one deliverable.
- **Ledger divergence already present.** If duplicate deliveries have already occurred in dev or
  prod, some recorded balances may already be wrong. The run should note whether it can tell, since
  a salon discovering a wrong balance during beta is a trust problem, not a bug report.
- **Scope creep into repair.** The temptation to fix defects while they are in front of you would
  turn a verification run into a payments rewrite and destroy the independence of the verdict.
- **Test-environment divergence.** Paystack test behaviour (especially around settlement timing,
  OTP, and refunds) may not match live. Any cell whose result depends on test-mode-specific
  behaviour must be flagged, so the verdict does not over-claim.
- **Beta delay.** This is the last gate; every day it takes is a day of launch. That pressure is
  itself a risk to the integrity of the verdict.

---

# Open Questions

- Does the business need an in-product refund capability before beta, or is an out-of-band refund
  (performed directly in the Paystack dashboard) acceptable for beta salons? This determines whether
  a "no refund path exists" finding is a beta blocker or a post-beta item. Requires a business call
  and cannot be decided from the code.
- Are there existing beta salons or real recorded payments in dev whose balances would need
  correcting if ledger divergence is found, and who owns that correction?

---

# Acceptance Criteria

1. **Given** this item is started, **when** any verification is executed, **then** a written test
   plan already exists as a persisted document in the repository.
2. **Given** the test plan, **when** it is read by someone who did not write it, **then** every
   matrix cell states its expected outcome and its pass criterion without further explanation.
3. **Given** the scenario matrix, **when** it is reviewed, **then** it contains cells for both GH and
   NG, and for success, failure, abandoned, duplicate webhook, and refund, with any not-applicable
   combination explicitly marked and justified.
4. **Given** a successful test payment in each currency, **when** the run is complete, **then**
   exactly one payment of the correct amount and currency is recorded, one receipt was sent to the
   customer, and one notification to the salon.
5. **Given** a failed test payment, **when** the run is complete, **then** no payment is recorded,
   no receipt is sent, and the salon's balance is unchanged.
6. **Given** a checkout the customer abandons without returning, **when** the charge nonetheless
   succeeded, **then** the payment is still recorded correctly and the receipt still sent.
7. **Given** the same payment-success event delivered twice, **when** the run is complete, **then**
   the actual observed effect on recorded amount, receipts, notifications and wallet balance is
   documented, and whether it violates requirement 12 is stated plainly.
8. **Given** a successful withdrawal, **when** the transfer completes, **then** the salon's wallet
   is reduced by exactly the withdrawn amount, once, and the withdrawal shows as completed.
9. **Given** a failed or reversed transfer, **when** the run is complete, **then** the salon's
   wallet balance is unchanged and the withdrawal shows as failed.
10. **Given** a duplicate withdrawal request, **when** submitted, **then** it is refused and only one
    transfer exists.
11. **Given** a withdrawal exceeding settled/available funds, **when** submitted, **then** it is
    refused with a reason the owner can act on.
12. **Given** a withdrawal held for OTP, **when** the owner looks at Payouts, **then** its state is
    not misleading — it is neither shown as complete nor as failed nor as an unexplained stuck item.
13. **Given** the run is finished, **when** the results document is read, **then** every cell carries
    pass, fail, or not-applicable with evidence, and no cell is silently missing.
14. **Given** the run is finished, **when** the verdict is read, **then** it states go or no-go on
    the payout path, the evidence behind it, whether `subaccount-split-cleanup` is unblocked, and
    whether beta launch is unblocked — as separate statements where they differ.
15. **Given** any defect found, **when** the run closes, **then** that defect exists as its own
    backlog item with a Jira ticket under the payments epic and a stated severity relative to beta.
16. **Given** the run closes, **when** `docs/backlog-open-followups.md` is read, **then**
    `payments-e2e-verification` reflects the outcome and `subaccount-split-cleanup` reflects the
    consequence for it.
17. **Given** the entire run, **when** audited, **then** no step targeted the production Supabase
    project or Paystack live keys.

---

# Success Criteria

- A single written verdict exists that the team can act on, and it in fact unblocks a decision —
  either `subaccount-split-cleanup` proceeds, or a specific, ticketed list of blockers exists that,
  once cleared, will let it proceed.
- Beta launch is no longer waiting on unexamined doubt: the beta gate is either released or
  converted into a finite, ticketed list of work.
- The number of payment defects discovered *after* beta launch by a real salon is zero — the
  measure of whether this run was worth doing.
- No salon reports a balance, receipt, or payout discrepancy during beta.
- The test plan is reusable: the next change to the payment path can be verified against it without
  rewriting it from scratch.
