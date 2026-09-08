# Second Owner Foundation — Planning Brief

- slug: `co-owner-role`
- backlog: `docs/backlog-open-followups.md` → *co-owner-role: Support a second owner on a salon*
- research brief: `docs/research/2026-09-08-second-owner-foundation.md`
- date: 2026-09-08

---

# Original Request

> Topic: Support a second owner on a salon — data model and permission foundation. There is currently no
> concept of a co-owner anywhere in the codebase... This item covers the foundation only: letting a salon
> have more than one owner-level account, and making every owner-gated check treat them equivalently —
> RLS policies, edge functions, and the salon-admin UI's owner checks. Investigate how tenant ownership is
> currently modelled and every place that assumes exactly one owner... Out of scope: the invite/accept flow
> (co-owner-invite).

---

# Summary

A salon can currently have exactly one owner account. If that person is unavailable — travelling, ill, has
left the business, or simply shares the business with a partner — nobody else can approve a withdrawal,
manage the subscription, change the payout destination, or perform any other owner-gated action. This
feature lets a salon have **two owner-level accounts that are treated identically by every permission
check**, and gives platform support a controlled way to add the second one.

The self-serve invite/accept flow is deliberately a separate, later item (`co-owner-invite`). This brief
covers the foundation it will build on: the product rules for what a second owner is, what they can do, who
can create one, and how the product must behave once one exists.

---

# Problem Statement

Salon ownership on Salon Magik is single-person by construction. Owner-only capabilities — billing and
subscription management, payout destinations, withdrawals, and other owner-gated actions — have exactly one
possible actor per salon. In practice salons are frequently run by two people (business partners, a
married couple, an owner plus a general manager who is a genuine co-principal), and a salon whose sole owner
account is unreachable is functionally locked out of its own money and its own subscription until support
intervenes with an elevated, TOTP-gated recovery action.

There is no product concept of a co-owner, no way to create one, and one explicit server-side rule that
rejects the attempt.

---

# Business Goal

- **Removes a single point of failure on the revenue path.** A salon that cannot reach its owner cannot pay
  its subscription or withdraw its earnings. Both outcomes cost Salon Magik money and generate support load.
- **Reduces manual support intervention.** Owner-recovery today is a super-admin, TOTP-gated backoffice
  action performed by a human. Making co-ownership a supported product state is the first step to that
  becoming self-serve.
- **Unblocks the `co-owner-invite` item**, which depends on this foundation and is a directly requested
  capability.
- **Matches how salons actually operate**, removing a friction point in onboarding conversations with
  partner-run salons.

---

# User Goal

As a salon owner, I want a second person to hold full owner-level access to my salon, so that either of us
can run the business — including billing, payouts, and withdrawals — without depending on the other being
available.

As platform support, I want to add a second owner to a salon on request, with the same safeguards as the
existing owner-recovery action, and without any risk of confusing "add a co-owner" with "recover a missing
owner".

---

# Scope

1. A salon may have **more than one** owner-level account (capped — see FR-2).
2. Every owner-gated check across the product treats all owners of a salon **identically**: server-side
   permission rules, backend functions, and the salon-admin UI. No owner is "primary", "original", or
   otherwise privileged over another.
3. A controlled, support-operated path to add a second owner to a salon that already has one — explicitly
   distinct and separately labelled from the existing "recover a missing owner" action, and held to the same
   elevated authorisation bar.
4. The existing rule that **one person may own only one salon** is preserved unchanged.
5. Owner-targeted communications (billing emails, digests, payment notifications, payout/withdrawal
   notices) reach **every** owner of the salon.
6. The salon-admin team/staff listing shows all owners of the salon with the Owner role, so it is visible
   who holds owner access.
7. Correct, distinguishable messaging when an email address offered as an owner already holds owner access —
   distinguishing "already an owner of *this* salon" from "already owns a *different* salon".
8. Verification that owner-equivalence genuinely holds on the payout-destination and withdrawal surfaces
   specifically (the research brief flags these as unverified).

---

# Out of Scope

- **The invite/accept flow** (`co-owner-invite`): owner-initiated invitation UI, sending, acceptance,
  onboarding of the invited person, and revoking a pending invite. Deliberately the next item.
- **Removing, demoting, or transferring ownership.** There is no owner-management screen today and none is
  added here. Removing an owner remains a support action via existing mechanisms.
- **Changing the "one person, one salon" rule.** Untouched.
- **Third and subsequent owners.** See FR-2 — the cap is two for now.
- **Changing the existing owner-recovery action's purpose or its authorisation bar.**
- **Any change to what owner-level access *means*** (i.e. no new or altered owner permissions) — this
  feature only changes *how many people* can hold it.
- **Approval workflows between co-owners** (e.g. requiring both owners to sign off on a withdrawal).
  Owners are peers acting independently.

---

# Functional Requirements

**FR-1 — A salon supports multiple owner accounts.**
A salon can have two distinct user accounts each holding owner-level access simultaneously. Attempting to
add a second owner must no longer be rejected on the grounds that the salon already has one.

**FR-2 — Owner count is capped at two per salon.**
A salon may have at most two active owner accounts. An attempt to add a third is rejected with a clear
message stating the salon already has the maximum of two owners and naming the current owners.

**FR-3 — All owners are permission-equivalent.**
Every action available to an owner is available to every owner of that salon, with no ordering, seniority,
or "created first" distinction. This explicitly includes: subscription and billing management, payout
destination management, withdrawal requests, staff and role management, salon settings, and all owner-only
routes and UI affordances in salon-admin.

**FR-4 — Owner-equivalence is verified on the payout and withdrawal surfaces.**
Payout-destination management and withdrawal requests must be demonstrably usable by *either* owner. The
research brief could not confirm how these two surfaces are authorised; this must be established and proven,
not assumed.

**FR-5 — Support can add a co-owner via an explicit, distinct action.**
Platform support can add a second owner to a salon that already has one. This is presented as its own
clearly labelled action ("Add co-owner"), separate from the existing owner-recovery action, and it is held
to the same elevated authorisation bar as that action (super-admin plus fresh second-factor confirmation).

**FR-6 — Adding a co-owner requires explicit confirmation showing current owners.**
Before the co-owner is added, support is shown how many owners the salon currently has and who they are, and
must confirm. This prevents an accidental co-owner addition when owner-recovery was intended.

**FR-7 — The existing owner-recovery action is unchanged in purpose.**
The recovery action continues to apply only to salons with no active owner, and continues to reject salons
that already have one. It does not become a general ownership-assignment tool.

**FR-8 — One person still owns only one salon.**
An account that is already the active owner of a different salon cannot be added as a co-owner here. The
attempt is rejected with a message explaining that this person already owns another salon.

**FR-9 — Owner-targeted communications reach every owner.**
All owner-addressed notifications — billing and subscription emails, payment notifications, daily digests,
and payout/withdrawal notices — are delivered to every owner of the salon, not only one.

**FR-10 — Payout-sensitive changes notify all owners.**
When a payout destination is created or changed, or a withdrawal is requested, every owner of the salon is
notified — so one owner cannot make a money-moving change without the other becoming aware of it.

**FR-11 — Owners are visible in the salon-admin team listing.**
The existing team/staff view lists every owner of the salon with the Owner role label. No new
owner-management screen is introduced; this is visibility only.

**FR-12 — Owner-email pre-checks distinguish the two "already an owner" cases.**
Where an email address is validated before being granted owner access, the response distinguishes:
(a) this address already has owner access to *this* salon — treated as a no-op with an explanatory message;
(b) this address already owns a *different* salon — rejected per FR-8. The two cases must not share one
generic message.

**FR-13 — A second owner does not change what the salon is billed.**
Adding a co-owner does not add a billable seat and does not alter the salon's subscription price or plan
limits, consistent with the first owner not being counted as a billable seat.

---

# Non-functional Requirements

- **Security.** Creating owner-level access is the highest-privilege grant in the product. The path to add
  a co-owner must not be looser than the existing owner-recovery action, and no client-side path may allow
  one user to grant owner access to another.
- **Auditability.** Every co-owner addition is attributable: who performed it, on which salon, for which
  account, and when — to the same standard as the existing owner-recovery action.
- **Backwards compatibility.** Every existing single-owner salon continues to behave exactly as today. No
  existing owner loses access, and no salon acquires an owner as a side-effect of this change.
- **Usability.** Messaging around ownership limits and conflicts must be specific enough for support to act
  on without reading the code (which salon, which account, which of the two rejection reasons applies).

---

# User Flow

**Adding a co-owner (support-operated, this item)**

1. A salon owner contacts support asking for their business partner to be given owner access.
2. Support opens the salon in backoffice and chooses **Add co-owner** (distinct from Recover owner).
3. Support enters the co-owner's email address.
4. The system validates the address:
   - already an owner of *this* salon → informs support, no change made;
   - already the owner of a *different* salon → rejected with that reason;
   - salon already has two owners → rejected with that reason.
5. Support is shown the salon's current owner(s) and confirms, satisfying the elevated authorisation bar.
6. The co-owner account is granted owner access and is emailed to say they now have owner access to the
   salon.
7. Both owners appear in the salon's team listing with the Owner role.

**Operating as a co-owner (the outcome that matters)**

1. The co-owner signs in to salon-admin.
2. They see the same navigation, routes, and owner-only affordances as the first owner.
3. They can manage the subscription, manage the payout destination, and request a withdrawal.
4. Owner-addressed notifications for the salon arrive for both owners; payout-sensitive actions taken by
   one owner notify the other.

---

# Constraints

- **One person, one salon** remains a firm product rule and is not relaxed by this work.
- **Two owners maximum** per salon for this iteration.
- Creating owner access remains a support-gated action until `co-owner-invite` ships; there is no self-serve
  path in this item.
- The existing owner-recovery action's purpose and elevated authorisation bar must be preserved as-is.
- No change to the set of capabilities an owner has — only to how many people can hold them.

---

# Assumptions

Decisions made autonomously (`--think`). Each is reversible; the question is recorded so a human can audit it.

- **Q: Should backoffice be able to add a co-owner at all, or should co-ownership wait entirely for the
  invite flow? → A: Yes, backoffice can add one (decided autonomously).** Without it, this foundation ships
  with no way to actually create a second owner, making it unverifiable in production and delivering nothing
  to salons that need a co-owner before `co-owner-invite` lands.
- **Q: Should the existing owner-recovery action be relaxed to permit a second owner, or should there be a
  distinct action? → A: A distinct, separately labelled action (decided autonomously).** Relaxing the
  recovery guard silently converts a safety check into an ordinary operation and makes "I meant to recover a
  lost owner" indistinguishable from "I added a second owner". Two named actions with the same
  authorisation bar cost little and keep intent explicit.
- **Q: How many owners may a salon have? → A: Two (decided autonomously).** The request and backlog both
  say "a second owner" / "co-owner". A stated cap makes the rejection message honest and keeps the change
  small; raising it later is a one-line product decision.
- **Q: Are owners fully equal, or is there a primary owner with extra rights? → A: Fully equal, including
  billing and payouts (decided autonomously).** A "primary owner" tier reintroduces the exact single point
  of failure this feature exists to remove.
- **Q: Should either owner be able to change the payout destination and request withdrawals? → A: Yes,
  with both owners notified of such changes (decided autonomously).** Restricting money movement to one
  owner defeats the purpose; notification is the proportionate control, and owner notifications already fan
  out to every owner, so this is a small extension rather than a new mechanism.
- **Q: Can a co-owner remove the other owner? → A: Out of scope; no owner-removal flow is added
  (decided autonomously).** No owner-management UI exists today, and building removal alongside creation
  widens scope and adds a real "co-owner locks out the founder" hazard that deserves its own design.
- **Q: Does a co-owner consume a billable seat? → A: No (decided autonomously).** The first owner is not
  counted as a billable staff seat, so counting the second would be an unannounced price increase.
  AC-11 verifies this rather than trusting it.
- **Q: Does the salon-admin UI need an owner-management screen? → A: No — visibility only in the existing
  team listing (decided autonomously).** Management belongs with the invite flow.
- **Assumption (to verify, not decided):** owner-targeted notification fan-out already addresses every owner
  of a salon; the research brief found this to be true for billing and digest paths. FR-9 requires this to
  be confirmed across all owner-addressed communications rather than assumed from those two.

---

# Risks

- **Ownership disputes.** Two equal owners with no removal flow means a partnership breakdown becomes a
  support ticket, and either party can move money. Mitigated by the two-owner cap, by FR-10 notifications,
  and by keeping creation support-gated in this iteration — but it remains a real operational exposure and
  is the strongest argument for prioritising owner-removal soon after `co-owner-invite`.
- **Financial exposure via payout destination.** A second owner can redirect where the salon's money goes.
  FR-10's notify-both-owners requirement is the mitigation; if it is dropped, this risk becomes material.
- **Support error.** "Add co-owner" and "Recover owner" sitting next to each other invites a mis-click that
  grants ownership to the wrong person. FR-6's confirmation showing current owners is the mitigation.
- **Silent inequality.** If any owner-gated surface is missed, a co-owner appears to have full access but
  fails at a critical moment (typically the withdrawal path — precisely the surface the research brief could
  not verify). FR-4 and AC-4 exist for this reason.
- **Expectation gap.** Salons told "you can have a co-owner" will expect to add one themselves. Until
  `co-owner-invite` ships, this is a support-only capability and should be communicated as such rather than
  announced as a self-serve feature.

---

# Open Questions

None blocking. The one unresolved item from research — how the payout-destination and withdrawal surfaces
are actually authorised — is an engineering question, not a product one, and is carried forward as FR-4/AC-4
for design and implementation to resolve.

---

# Acceptance Criteria

**AC-1 — Two owners can coexist**
Given a salon with one active owner
When a second owner account is added via the support co-owner action
Then both accounts hold owner access to that salon and both are listed as owners.

**AC-2 — Third owner rejected**
Given a salon that already has two active owners
When support attempts to add a third
Then the attempt is rejected with a message stating the salon already has the maximum of two owners, and no
change is made.

**AC-3 — Equivalent access**
Given a salon with two owners
When either owner signs in to salon-admin
Then each sees the same owner-only navigation, routes, and affordances, and each can manage the subscription
and salon settings.

**AC-4 — Equivalent access on the money path**
Given a salon with two owners and a configured payout destination
When the owner who did *not* configure it attempts to view it, change it, and request a withdrawal
Then all three succeed, with no authorisation failure at any layer.

**AC-5 — Recovery action unchanged**
Given a salon that already has an active owner
When support uses the existing owner-recovery action
Then it is still rejected on the grounds that the salon already has an owner.

**AC-6 — One person, one salon still enforced**
Given an account that is already the active owner of salon A
When support attempts to add that account as a co-owner of salon B
Then the attempt is rejected with a message explaining that the person already owns another salon.

**AC-7 — Already an owner of this salon**
Given an account that is already an owner of salon A
When support attempts to add that same account as a co-owner of salon A
Then the response states that this person is already an owner of this salon, and no duplicate grant is made.

**AC-8 — Confirmation shows current owners**
Given a salon with one owner
When support initiates the add-co-owner action
Then the current owner(s) are shown and explicit confirmation plus the elevated authorisation step is
required before the grant is made.

**AC-9 — Notifications reach both owners**
Given a salon with two owners
When an owner-addressed notification is generated (billing, payment, digest)
Then both owners receive it.

**AC-10 — Payout changes notify both owners**
Given a salon with two owners
When one owner changes the payout destination or requests a withdrawal
Then the other owner is notified of that action.

**AC-11 — Billing unchanged**
Given a salon on any subscription plan
When a second owner is added
Then the salon's plan, price, and seat/staff limits are unchanged.

**AC-12 — No regression for single-owner salons**
Given every existing salon with exactly one owner
When this feature ships
Then their owner retains identical access and behaviour, and no salon gains an owner it did not have.

**AC-13 — Attributable**
Given a co-owner has been added
When the action is reviewed
Then it is attributable to the support account that performed it, with salon, target account, and timestamp.

---

# Success Criteria

- **Correctness first:** zero reports of a co-owner being blocked from an owner-level action — especially
  withdrawals and payout-destination changes. This is the primary measure; a co-owner who fails at the
  money path is worse than no co-owner.
- **Support-load reduction:** decline in owner-recovery/"owner unreachable" support tickets, and in
  billing-lapse or withdrawal-blocked incidents attributable to a single unavailable owner.
- **Adoption signal:** number of salons that request and receive a co-owner, as the demand evidence for
  prioritising `co-owner-invite` and, after it, owner removal.
- **No regressions:** no increase in owner-access-related incidents for the existing single-owner
  population.
