# Original Request

> How should one person spanning several salons be modelled and represented? Two different
> scenarios are being conflated and the first job is to separate them with evidence: (a) Branches
> within one business — already supported (`locations`, `staff_locations`, the chain plan, Business
> Hub / `owner_hub`). Establish exactly what this already gives an owner and where it stops. (b) One
> identity holding roles at several separate businesses (`tenants`) — establish current facts, and
> whether it is a good idea. Also establish current facts for: owner removal being support-mediated
> (reassignment to an already-onboarded staff member); and the fact that the salon-admin co-ownership
> surface (owners list, invite entry point, role label in the sidenav profile block) is entirely
> unbuilt. Out of scope: co-owner-invite flow itself; payout-tables-rls.

Backlog item: `multi-salon-owner-identity` (`docs/backlog-open-followups.md`), status `in-progress`.
Deliverable: *"a design direction to review before any implementation — the owner/staff experience
for multiple salons, and how it interacts with co-ownership."*

Input: the Technical Brief for this item, `docs/research/2026-09-09-multi-salon-owner-identity.md`,
including its five-gaps addendum on the pricing, trial, allowance, creation and delinquency facts
this brief had blocked on.

---

# Summary

Two things that sound alike are being treated as one, and they are not the same product:

- **Branches of one business** are already a solved product. A `chain`-plan salon has multiple
  locations, staff are assigned to them, and the owner gets a business-wide "Business Hub" view
  plus per-location views. Nothing in this brief changes that, and this remains the answer we give
  anyone opening a second *branch*.
- **One person who owns two genuinely separate businesses** is currently impossible. Staff can hold
  roles at many salons and get a salon switcher; owners are blocked at the database from actively
  owning more than one salon. A person who opens an unrelated second salon today must register a
  second email address and maintain two logins for one human.

This brief decides that the owner restriction is **relaxed as a reviewed exception, not opened**.
Salon Magik can grant one identity ownership of a second salon; nothing self-serve can. The
restriction was put in place deliberately to stop the platform being gamed, and the research
commissioned for this brief confirmed with hard figures that the gaming routes are real and open
today: splitting one business into several `solo` salons is cheaper than one `chain` salon at every
site count checked, every new salon gets its own fresh trial with no check against the person's
existing salons, every new salon gets its own free message balance, salons are created self-serve by
any signed-in person with no human review, and a delinquent salon has no consequence whatsoever for
its owner's other salons. So the honest customer gets unblocked through a human-reviewed grant, and
the arbitrage doors stay shut.

Where a person does own several salons, those salons stay completely independent of one another —
separate subscriptions, separate money, separate staff, separate data, no combined view. The brief
also decides the small representation gap that co-ownership left behind: an owner can see who else
owns their salon, and every user can see what role they are currently signed in as.

Everything here is scoped to *how the product behaves*. Whether and how the database restriction is
safely relaxed is an engineering decision for the next stage.

---

# Problem Statement

Three distinct problems sit behind the request:

1. **A real person cannot be one account.** Salon Magik forbids an identity from actively owning
   more than one salon. The only workaround is a second email address, which fragments the person's
   login, notifications, and support history, and makes "who owns this salon" unanswerable at the
   human level.
2. **Two different needs get the same wrong answer.** Someone who wants a second *branch* and
   someone who wants a second *business* both currently hit "you can only own one salon". The first
   should be pointed at locations and the chain plan; the second should be allowed. Today neither
   gets an answer, because the product never distinguishes them.
3. **Co-ownership shipped invisibly.** A salon can now legitimately have two owners, but nothing in
   salon-admin says so. There is no owners list, and the profile block in the sidebar shows a name
   and email with no role at all. A co-owner cannot confirm they are an owner, and an owner cannot
   see who else has owner-level control of their business.

---

# Business Goal

- Remove a hard block on a growth path we actively want: successful salon owners opening a second
  salon. Each additional salon is an additional subscription; the current rule makes that customer's
  life worse at precisely the moment they are worth most.
- Stop pushing customers into duplicate accounts, which corrupt our own understanding of who our
  customers are and make support, billing questions, and account recovery harder for us to service.
- Do it without opening the arbitrage the current rule is holding shut. The measured price gap
  between N `solo` salons and one `chain` salon means an ungated relaxation would actively cannibalise
  our highest-value plan, so the commercial value of this change depends on the gate, not just on the
  unblocking.
- Make co-ownership legible in-product, so the co-ownership feature we have already built can be
  sold, supported, and trusted rather than existing only in the database.

---

# User Goal

- **As an owner of more than one salon**, I sign in once and move between my salons from the
  switcher, with each salon's data, staff, money, and settings kept entirely separate — the same way
  a stylist who works at two salons already moves between them.
- **As an owner opening another branch of my existing business**, I am steered to add a location
  under my current salon rather than a second salon.
- **As an owner or co-owner**, I can see who owns this salon alongside me.
- **As any signed-in user**, I can see what role I currently hold in the salon I am looking at.

---

# Scope

1. **Multi-salon ownership is permitted by exception.** One identity may hold an active owner role
   at more than one salon, but only where Salon Magik has granted it through backoffice after
   review. The single-salon rule remains the default and remains enforced on every self-serve
   path.
2. **Salons remain fully independent.** Each salon an owner owns keeps its own subscription and
   billing, its own wallet/payouts/withdrawals, its own staff, clients, bookings, services and
   settings. Nothing is shared, merged, or aggregated across salons because the same person owns
   them.
3. **Switching salons uses the existing salon switcher.** An owner of several salons gets the same
   switcher multi-salon staff get today, and once inside a salon the experience is identical to
   owning only that one (including Business Hub and locations, if that salon is on a chain plan).
4. **Ownership grants across salons stop being refused — on the reviewed path only.** Where the
   product today refuses to make someone an owner because they already own a different salon, that
   refusal is lifted for a backoffice grant and retained everywhere else. (The owner-facing invite
   flow that would eventually use this is a separate item — see Out of Scope.)
5. **The exception is gated on commercial standing.** An additional ownership is granted only where
   the person's existing salons are in good standing, and the granted salon carries no trial and no
   promotional pricing. These conditions are part of the feature, not an operational nicety — see
   Revenue & Platform-Gaming Risks.
6. **Owners list in salon-admin.** An owner or co-owner can see the list of people who hold owner
   role at the salon they are currently in — name and email, all owners shown as equals, no primary
   or secondary distinction.
7. **Role shown in the sidebar profile block.** The signed-in user's role in the current salon is
   displayed alongside their name and email, for every role, not just owners.
8. **Branch-versus-business guidance.** Where a user is choosing between "another branch" and
   "another salon", the product states the distinction plainly: branches belong to one business and
   share its staff, reporting and subscription; separate salons are separate businesses with
   separate subscriptions.

---

# Out of Scope

- **The co-owner invite and acceptance flow** (`co-owner-invite` backlog item). This brief removes
  the cross-salon refusal that flow would otherwise hit; it does not build the flow.
- **Owner removal and support-mediated reassignment** (`owner-removal-support` backlog item). It
  keeps its own scope; this brief only records the constraint that reassigning ownership of one
  salon must never affect the same person's other salons.
- **RLS hardening on payout and wallet tables** (`payout-tables-rls` backlog item).
- **The pre-existing free-message allowance defect.** Research established that the per-plan free
  message allowance never resets for any salon — every salon's free balance is effectively one-time,
  for everyone, unrelated to multi-salon ownership. That is a real revenue and expectation problem
  and it needs its own item; this brief only records it, because fixing it changes what every
  existing customer gets and is far wider than this feature.
- **Restricting or gating self-serve salon creation in general.** Research established that any
  signed-in person can create unlimited salons with no review, each with a fresh trial. This brief
  refuses to let *ownership* be the route to that only in the specific sense of holding several
  active ownerships at once; it does not reform salon creation, which affects every signup and is a
  separate product decision.
- **Cross-salon delinquency consequences.** A person delinquent at one salon faces no consequence at
  another today. This brief gates a *new grant* on good standing but does not introduce
  identity-level collections behaviour, which would change how we treat every existing customer.
- **Any cross-salon combined view.** No portfolio dashboard, no combined reporting, no
  "all my salons" revenue figure, no cross-salon Business Hub. Business Hub stays a within-one-
  business concept covering that business's locations only. This is a deliberate exclusion, not a
  deferral of something implied: combining businesses raises separate questions about permissions,
  currency, and comparability that nothing in the request asks for.
- **Sharing anything between salons owned by the same person** — no shared staff records, service
  catalogues, client lists, branding, or single combined invoice.
- **A self-serve "create another salon" flow.** Additional salons are created through whatever path
  creates salons today; this brief does not add a new creation entry point.
- **Any change to how branches, locations, `staff_locations`, or the chain plan work.**
- **Changes to non-owner role behaviour across salons**, which already works.

---

# Functional Requirements

**Multi-salon ownership**

1. Salon Magik can grant an identity that is an active owner of one salon an active owner role at
   a second, different salon, and both ownerships remain active simultaneously.
2. There is no fixed numeric cap on how many salons one identity may own; each additional grant is
   reviewed on its own merits rather than allowed up to a number.
3. An identity may simultaneously hold the owner role at one salon and a non-owner role at another,
   in either order, with no interaction between the two.
4. A salon may have more than one owner, and each of those owners may independently own other
   salons; the two axes do not constrain each other.
5. Where a grant was previously refused solely because the person already owns a different salon,
   that refusal no longer applies to a reviewed backoffice grant. It continues to apply, unchanged,
   to every self-serve path.
6. Owning several salons grants no permission at any salon beyond what owning that one salon grants.
   An owner of salon A and salon B has no visibility into B while acting in A.

**Switching and context**

7. An owner who holds a role at more than one salon sees the salon switcher, listing every salon
   they hold any role at, each labelled with the role they hold there.
8. An owner who holds a role at exactly one salon sees no switcher — unchanged from today.
9. Selecting a salon in the switcher places the user fully inside that salon: its data, its
   navigation, its role, and (where applicable) its Business Hub and locations.
10. The salon a user was last in is remembered per user and restored on next sign-in; if that salon
    is no longer available to them, they are placed in an available one rather than shown an error.

**Independence of salons**

11. Each salon retains its own subscription, billing status, and plan, unaffected by the ownership,
    plan, or billing status of any other salon the same person owns.
12. Each salon retains its own wallet, payout destination, and withdrawals. Money never moves
    between salons and no balance is ever presented as a combined figure.
13. Notifications and communications about a salon are addressed to that salon's owners in the
    context of that salon. A person owning several salons receives one communication per salon and
    each identifies which salon it concerns.
14. Deactivating, suspending, or ending a person's ownership at one salon leaves their ownership of
    every other salon untouched.

**Representation**

15. An owner or co-owner can view a list of the people holding owner role at the salon they are
    currently in, showing at least each owner's name and email address.
16. All owners appear in that list as equals, in a stable order, with no primary/secondary label or
    visual ranking.
17. The owners list reflects only the salon currently being viewed, never any other salon the viewer
    owns.
18. Only owners of the salon may view the owners list; other roles have no access to it and no entry
    point to it.
19. The sidebar profile block shows the signed-in user's role at the current salon, alongside the
    existing name and email.
20. The role shown updates when the user switches salons, matching the role held at the newly
    selected salon.
21. Owners and co-owners are both labelled "Owner"; the role label distinguishes roles, not
    seniority within a role.
22. Role labels are human-readable and consistent wherever a role is displayed in salon-admin.

**Branch-versus-business guidance**

23. Wherever a user is choosing between adding a branch and adding a separate salon, the product
    states that branches share one business's staff, reporting and subscription, while separate
    salons are independent and separately subscribed.

**Gating the exception**

These requirements are the entire commercial safety of this feature. Research established that salon
creation is self-serve with no human review, so nothing upstream constrains a person who wants many
salons; the only place a human currently stands between one identity and several *active ownerships*
is what is specified here. Requirements 24–28 are therefore not documenting an existing control —
they are the control, and shipping any subset of them ships the arbitrage described below.

24. Granting an identity ownership of an additional salon is a backoffice action only. No path in
    salon-admin, and no public signup or onboarding path, results in one identity holding an active
    owner role at a second salon.
25. An additional ownership may only be granted while **every** salon that identity already actively
    owns is in good standing — on a paid subscription, not in a failed-payment or grace state, not
    suspended, not cancelled. A single salon out of standing blocks the grant.
26. An additional ownership may not be granted for a salon that is currently in a trial. Where the
    reviewed customer wants a new salon, the salon is billed from the start of the grant.
27. A salon obtained through an additional-ownership grant carries no free trial and no
    introductory, promotional, referral, or discount pricing.
28. Every additional-ownership grant records who approved it, the identity and salon involved, and
    the stated business reason, using the same audit convention as existing ownership additions.
29. The review must be able to see, at the point of decision, every salon the identity already holds
    an owner role at and the standing of each — a grant cannot be assessed against requirement 25
    without it.

---

# Non-functional Requirements

- **Usability.** A multi-salon owner must be able to tell at a glance which salon they are acting in
  before taking any action that affects money, bookings, or staff. Salon identity must be visible in
  the persistent navigation, not only on the page they happen to be on.
- **Safety of separation.** No action taken while inside one salon may read from or write to another
  salon, including for a person who owns both. Separation must hold at the server, not only in what
  the interface offers.
- **Accessibility.** The owners list, the role label, and the salon switcher meet the same
  accessibility standard as the rest of salon-admin, including keyboard operation and screen-reader
  announcement of the currently selected salon and role.
- **No regression for single-salon users.** Users who hold a role at exactly one salon — the large
  majority — see no new interface elements other than the role label, and no change to any existing
  flow.
- **Auditability.** Every change to who owns a salon is recorded with who made the change and when,
  consistent with how ownership additions are already recorded.

---

# User Flow

**Owner of two separate salons, signing in**

1. Signs in with one email address.
2. Lands in the salon they were last working in.
3. The sidebar profile block shows their name, email, and "Owner".
4. The salon switcher shows the current salon's name; opening it lists both salons with the role
   held at each.
5. Selects the other salon. The whole interface re-enters that salon: its bookings, staff, money,
   settings, and its own Business Hub or locations if it is a chain-plan salon.
6. Nothing from the first salon is visible or reachable from inside the second.

**Owner requesting a second salon**

1. Asks Salon Magik to let them own a second, separate salon under the same login.
2. Salon Magik reviews the request against the standing of every salon they already own.
3. If any is delinquent, suspended, cancelled, or still in trial, the request is declined and the
   reason names that salon.
4. If all are in good standing, the additional ownership is granted, with the reason recorded, and
   the new salon is billed from the start with no trial or promotional pricing.

**Owner checking who else owns the salon**

1. From within a salon, opens the owners list.
2. Sees every person holding owner role at this salon — including themselves — as an unranked list
   of names and emails.
3. Switches to another salon they own and opens the owners list there; sees that salon's owners
   only.

**Owner deciding between a branch and a second salon**

1. Wants to open a second site.
2. Is shown the distinction: another branch of this business (shared staff, shared reporting, one
   subscription) versus a separate salon (independent, separately subscribed).
3. Chooses a branch and adds a location under the existing salon; or chooses a separate salon, which
   is a reviewed request rather than something they complete themselves.

---

# Constraints

- Each salon is separately subscribed and separately billed. Multi-salon ownership must not become a
  route to running several businesses on one subscription.
- Multi-salon ownership must not become a cheaper substitute for the chain plan. The measured price
  ladder makes N separate salons cheaper than one chain salon with N locations at every site count
  checked, so a multi-site operator has a standing financial incentive to misuse this feature. The
  review gate exists for this reason and cannot be traded away for convenience.
- Salons are separate legal and financial entities. Funds, payout destinations, and financial records
  must never be pooled or presented as pooled, regardless of common ownership.
- Salons never remove an owner themselves; owner removal is a support-mediated request handled by
  Salon Magik (a decision already taken, delivered by the `owner-removal-support` item). Nothing in
  this brief may create a self-serve owner-removal capability.
- Co-owners are equals. There is no primary owner concept in the product, and this brief must not
  introduce one through display or ordering.
- Branches of one business belong under one salon. Multi-salon ownership must not be positioned or
  documented as the way to run branches.

---

# Assumptions

Decisions taken autonomously while the user was away, each recorded so any one of them can be
reviewed and reversed independently.

- Q: Should one identity be allowed to actively own several separate salons at all, or should the
  current restriction stand? -> A: Allowed, but only as a backoffice-granted exception. The customer
  need is real — the only current workaround is a second email address, which degrades login,
  notifications, billing contact and support while corrupting our own account data. But the
  restriction was deliberately put in place to prevent gaming, and every gaming route this brief
  worried about was subsequently confirmed live and open by research. A reviewed grant unblocks the
  honest customer without opening any of them. (decided autonomously; revised after the user
  identified the anti-gaming rationale, then confirmed by the five-gaps research)
- Q: Now that the price ladder is known — N `solo` salons undercut one `chain` salon at every count
  checked, and the gap widens with N — does that change the decision? -> A: It confirms the gate
  rather than reversing the decision. The leak is real and material, but it is a leak in *ungated
  acquisition of salons*, not in one person legitimately owning two businesses. Gating the exception
  addresses it; refusing the exception outright would keep punishing the honest customer for a
  pricing shape they are not exploiting. (decided autonomously)
- Q: Should the good-standing condition apply to any one of the person's salons, or all of them?
  -> A: All. A person with one healthy salon and one delinquent one is exactly the case the condition
  exists to catch, and "any" would be trivially satisfiable. (decided autonomously)
- Q: Should a granted salon be allowed a trial, given every new salon gets a fresh 14-day trial today
  with no check against the person's other salons? -> A: No trial and no promotional pricing on a
  granted salon. Trial farming is live and unchecked, and someone who already runs a salon on the
  platform has no evaluation need a trial serves. (decided autonomously)
- Q: Should this brief fix the free-message allowance never resetting, since research found the
  quota is one-time rather than monthly for every salon? -> A: No — record it, scope it out, and
  raise it as its own item. It is a pre-existing defect affecting every customer, its fix changes
  what people already receive, and it is not caused by or specific to multi-salon ownership.
  (decided autonomously)
- Q: Should this brief introduce cross-salon delinquency consequences, since a suspended owner today
  can operate or create other salons freely — and can still use salon-admin fully at the suspended
  salon itself? -> A: No. Gate the new grant on standing (requirement 25) and stop there.
  Identity-level collections would change how every existing customer is treated and belongs with the
  billing work, not here. The finding that suspension does not gate salon-admin at all is recorded
  as a risk for that item. (decided autonomously)
- Q: Should multi-salon owners get a combined cross-salon view (portfolio dashboard, combined
  reporting, a Business Hub spanning salons)? -> A: No. Salons stay fully independent and the owner
  uses the existing salon switcher, exactly as multi-salon staff do today. A combined view raises
  unasked questions about permissions, currency and comparability, and would blur the branch-versus-
  business line this brief exists to sharpen. It can be revisited as its own item once multi-salon
  owners actually exist. (decided autonomously)
- Q: Should there be a cap on how many salons one identity may own? -> A: No numeric cap, because
  the review gate is the control instead. An arbitrary number would be both a wall to a legitimate
  operator and no obstacle at all to someone gaming us below the threshold. (decided autonomously)
- Q: Should the co-ownership representation surface (owners list, role label) be built now, or wait
  for the co-owner invite flow? -> A: Now, and in this item. Co-ownership already exists in the
  product but is invisible in salon-admin, which makes it unsupportable; both additions are small,
  presentational, and independent of the invite flow. (decided autonomously)
- Q: Should the owners list distinguish a primary owner from a co-owner? -> A: No. All owners are
  shown as equals with no ranking, consistent with the already-shipped decision that there is no
  primary owner. Where "primary owner" appears in the owner-removal item, it reads as "the salon's
  owner", not as a distinct rank to be displayed. (decided autonomously)
- Q: Who may see the owners list? -> A: Owners of that salon only. Knowing who holds owner-level
  control is owner-level information, and no other role has a stated need for it. (decided
  autonomously)
- Q: Should the role label in the sidebar be owners-only, or shown for every role? -> A: Every role.
  Knowing what you are signed in as is generally useful, especially for anyone holding different
  roles at different salons, and restricting it would be an arbitrary carve-out. (decided
  autonomously)
- Q: Does this brief add a self-serve "create another salon" flow? -> A: No. It removes the block on
  *holding* a second ownership; salons continue to be created by whatever path creates them today.
  Adding a creation flow is a separate product decision with its own onboarding, billing and
  verification questions. (decided autonomously)
- Q: What happens to a person's other salons when ownership of one is reassigned away from them?
  -> A: Nothing. Ownership is per salon; losing or leaving one salon has no effect on any other.
  (decided autonomously)
- Assumed: relaxing the owner restriction is technically contained. The research found the rule
  enforced in a database trigger and a pre-flight invite check, and did not identify billing, payout,
  Business Hub, or context-resolution logic that depends on an identity owning at most one salon.
  Confirming that is engineering's to verify at the design stage; if something material does depend
  on it, that is a reason to re-scope, not to proceed silently.
- Assumed: a person owning several salons is uncommon relative to the user base, so the design
  should optimise for not disturbing single-salon users.

---

# Revenue & Platform-Gaming Risks

The single-owner rule was put in place deliberately to stop the platform being gamed. This section
was written speculatively in the first draft and has since been checked against the codebase; each
route below is now marked with what research actually found. They are ordered by how much money is at
stake.

**R-1. Tier arbitrage — the chain plan becomes optional. CONFIRMED, and larger than assumed.** The
plan ladder exists to charge more as a business grows, and the chain plan specifically monetises
operating several sites. Several `solo` salons are a cheaper synthetic substitute, and the measured
figures are not close: at two sites, separate solo salons cost roughly 40% of one chain salon; at
three, under half; at ten, around 60% of the chain price. The gap widens with every site added, so
the customers with the strongest incentive to misuse this are precisely the large multi-site
operators we most want on the chain plan. What they give up is real — shared staff, combined
reporting, one business identity — but an operator who does not value those gets the same footprint
for materially less.

**R-2. Trial farming. CONFIRMED.** Every new salon receives its own fresh 14-day trial, written at
signup with no check of the signing-up person's existing or prior salons, and a promo-code mechanism
can extend it further. The single-owner rule is currently the only thing capping one identity at one
concurrent trial. (Whether the promo mechanism itself blocks reuse of the same code by the same email
across signups was not established; it does not change the base finding.)

**R-3. Quota multiplication. CONFIRMED in shape, with an important correction.** Each salon gets its
own free message balance — 30 for `solo` against 500 for `chain` — so splitting into N solo salons
yields 30×N against 500, the same multiplication shape as R-1, and SMS carries a real per-message
cost to us at the provider. The correction: that balance never resets, for any salon on any plan.
There is no monthly reset anywhere in the product, so the free allowance is effectively one-time for
the life of a salon. That makes R-3 smaller than feared for now — but it also means a separate,
pre-existing defect is sitting under it, and if the reset is ever implemented as advertised, R-3
becomes a recurring monthly leak rather than a one-off. Scoped out of this brief; see Open Questions.

**R-4. Delinquency escape. CONFIRMED, and worse than described.** Suspension is entirely
salon-scoped: nothing in the delinquency path is keyed to a person, so a delinquent or suspended
owner faces no consequence at any other salon, and can freely stand up new ones. Worse, suspension
does not lock the salon's own admin either — a suspended owner keeps full use of every internal tool
and only new public bookings are blocked. Our collections leverage is therefore weaker than assumed
even before multi-salon ownership; multi-salon ownership would multiply the exposure by N.

**R-5. Promotion and referral self-dealing. PARTIALLY CONFIRMED.** A promo-code mechanism granting
bonus trial days exists and is applied per salon at signup. Whether it limits reuse by the same
person across salons was not established.

**R-6. Concentration of financial exposure. Unchanged, not investigated.** One identity controlling N
wallets and N payout destinations raises how much a single bad actor can extract, and interacts badly
with the payout and withdrawal gaps already on the backlog.

**What actually contains this.** Every route except R-6 depends on obtaining additional salons
cheaply and without a human looking. Research settled the decisive question here in the worst
direction: salon creation is fully self-serve — any signed-in person can create unlimited salons
directly, each immediately self-owned, each with its own trial and its own message balance, with no
backoffice approval anywhere in the path. There is no existing process gate. The only active control
is the single-owner rule this brief proposes to relax.

That makes requirements 24–29 load-bearing rather than documentary. With a human reviewing every
additional *active ownership*, and with good-standing, no-trial and no-promo conditions attached,
R-1 through R-5 collapse from "arbitrage anyone can run" to "a request someone has to justify to us"
— which is what the original restriction achieved, without also blocking the legitimate customer.
Shipping the relaxation without the full gate would open all five routes at once.

Note what the gate does *not* fix: because creation is self-serve, a determined person can still
create many salons *sequentially* — own one, abandon it, create another — collecting a fresh trial and
a fresh message balance each time. That route exists today, is unchanged by this brief, and is not
this brief's to close; it belongs with salon creation, which is scoped out.

---

# Risks

- **Branch-versus-business confusion.** Once owning several salons is possible, owners may set up
  branches as separate salons, ending up with fragmented staff and reporting and several
  subscriptions they did not intend — then ask us to merge them, which we cannot do. Mitigated by
  requirement 23; residual risk remains and should be watched in support volume. The price ladder
  makes this worse, not better: the fragmented setup is also the cheaper one, so a confused customer
  and a customer gaming us look identical at the point of request, and the review is what
  distinguishes them.
- **The gate becomes a bottleneck.** Every additional salon now needs a human decision, so a
  legitimate expanding operator waits on us. Accepted deliberately: the alternative is an ungated
  discount door, and the population involved is small.
- **The gate erodes.** A reviewed exception is only as good as the review. If pressure to approve
  quickly turns requirements 25–27 into a formality, R-1 to R-5 reopen without anything visibly
  changing in the product. The audit record in requirement 28 is what makes erosion detectable.
- **Acting in the wrong salon.** A multi-salon owner who misreads which salon they are in could
  refund the wrong client, pay the wrong staff member, or change the wrong prices. Mitigated by
  making salon identity persistently visible; the consequence of failure is real money.
- **Support and identity ambiguity.** "The owner" becomes a less precise phrase once one person owns
  several salons. Support conversations, notifications and audit records must always name the salon.
- **Perceived entitlement to a discount.** Owners of several salons may expect bundled or discounted
  pricing, and will notice that separate salons already cost less than the chain plan. The constraint
  is that each salon is separately subscribed; there is no multi-salon pricing in this brief, and the
  expectation gap is a commercial question to answer separately.
- **Revealing owner identities.** The owners list exposes names and email addresses of owners to
  other owners. Acceptable — they already share full control of the business — but it must not leak
  to other roles or across salons.
- **A visible role label invites a permissions conversation.** Showing "Receptionist" or "Manager"
  in the sidebar makes role boundaries more salient and may increase requests about what each role
  can do. This is a net gain in clarity, not a reason to hide the label.

---

# Open Questions

Both previously-blocking questions are resolved; what remains does not block this brief.

- Is the price ladder itself right? Separate solo salons undercutting the chain plan at every site
  count is a pricing problem this brief works around with a review gate rather than solves. If
  pricing is ever restructured so that the chain plan is the cheaper way to run N sites, most of the
  case for gating this feature falls away. **Commercial, not product-scope; raise separately.**
- Is there a commercial policy for someone subscribing several salons — standard price per salon, or
  a deliberate multi-salon arrangement? Owners will ask; the brief currently assumes standard
  per-salon pricing with no bundle.
- Who at Salon Magik owns the review decision, and what evidence do they require of a requester?
  Requirement 25 defines the condition; who applies it and on what evidence is an operational policy
  question outside this brief.
- The free message allowance never resets, for any salon on any plan, despite plans advertising a
  monthly figure. This needs its own backlog item — it is a live gap between what is sold and what
  is delivered, independent of this feature.
- Suspension does not restrict salon-admin at all; a suspended owner keeps full internal access.
  Whether that is intended belongs with the billing/lifecycle work, not here.
- Should support or backoffice be able to see, for one person, every salon they hold a role at?
  Requirement 29 needs this for the review decision, so some form of it is now implied; the fuller
  question of a general cross-salon person view belongs with the owner-removal work.

---

# Acceptance Criteria

**Multi-salon ownership**

- AC-1. Given a person is an active owner of salon A and all their salons are in good standing, when
  Salon Magik grants them the owner role at salon B through backoffice, then the grant succeeds and
  they are an active owner of both A and B.
- AC-2. Given a person actively owns salons A and B, when they act in salon A, then no data,
  navigation entry, figure, or setting belonging to salon B is visible or reachable.
- AC-3. Given a person owns salon A and holds a non-owner role at salon B, when they use either
  salon, then each role applies only at its own salon and neither is altered by the other.
- AC-4. Given a salon has two owners and one of them also owns another salon, when either owner acts
  at the shared salon, then both have identical owner capability there.
- AC-5. Given a person actively owns two salons, when ownership of one is ended, then their
  ownership of the other remains active and unchanged.
- AC-6. Given a reviewed backoffice grant that would previously have been refused because the person
  already owns a different salon, when it is attempted, then it is no longer refused on that ground.

**Gating the exception**

- AC-7. Given any self-serve path — salon-admin, public signup, or onboarding — when it would result
  in one identity holding an active owner role at a second salon, then it is refused exactly as it is
  today.
- AC-8. Given a person who actively owns two salons, one in good standing and one delinquent,
  suspended, cancelled, or unpaid, when an additional ownership is attempted for them, then it is
  refused and the reason names the salon that is not in good standing.
- AC-9. Given a person whose only salon is still in a trial, when an additional ownership is
  attempted for them, then it is refused.
- AC-10. Given a salon obtained through an additional-ownership grant, when its billing begins, then
  it carries no free trial and no introductory, promotional, referral, or discount pricing.
- AC-11. Given any additional-ownership grant, when it completes, then a record exists naming the
  approver, the identity, the salon, and the stated business reason.
- AC-12. Given a reviewer is assessing an additional-ownership request, when they open it, then they
  can see every salon that identity actively owns and the standing of each before deciding.

**Switching and context**

- AC-13. Given a person holds a role at more than one salon, when they sign in, then the salon
  switcher is shown listing every salon they hold a role at, each with the role held there.
- AC-14. Given a person holds a role at exactly one salon, when they sign in, then no salon switcher
  is shown and their experience is unchanged from before this feature.
- AC-15. Given a multi-salon owner is in salon A, when they select salon B in the switcher, then the
  entire interface — navigation, data, role label, and any Business Hub or location context —
  reflects salon B.
- AC-16. Given a multi-salon owner selected salon B and signed out, when they sign in again, then
  they are returned to salon B.
- AC-17. Given a person's last-used salon is no longer available to them, when they sign in, then
  they are placed in a salon they do still have access to, with no error state.
- AC-18. Given a multi-salon owner is anywhere in salon-admin, when they look at the persistent
  navigation, then the name of the salon they are acting in is visible.

**Independence**

- AC-19. Given a person owns salons A and B on different plans or billing states, when either salon
  is viewed, then its subscription, plan and billing status are its own and are unaffected by the
  other's.
- AC-20. Given a person owns salons A and B, when wallet balance, payout destination, or withdrawals
  are viewed in either, then only that salon's figures appear and no combined total is presented
  anywhere.
- AC-21. Given an event at salon A that notifies owners, when the notification is sent to a person
  who also owns salon B, then they receive it once, and it identifies salon A.
- AC-22. Given a person owns salons A and B and A becomes suspended, when they use salon B, then
  salon B is entirely unaffected.

**Representation**

- AC-23. Given an owner is in a salon with two owners, when they open the owners list, then both
  owners appear with name and email, in a stable order, with no primary/secondary label.
- AC-24. Given an owner owns salons A and B, when they open the owners list in salon A, then only
  salon A's owners appear.
- AC-25. Given a user who is not an owner of the current salon, when they use salon-admin, then no
  owners list is presented to them and it cannot be reached.
- AC-26. Given any signed-in user, when they look at the sidebar profile block, then their role at
  the current salon is shown alongside their name and email.
- AC-27. Given a user holds different roles at two salons, when they switch between them, then the
  role shown updates to match the salon they are now in.
- AC-28. Given a salon with two owners, when either views the sidebar profile block, then both see
  "Owner" with no distinction between them.

**Guidance**

- AC-29. Given an owner is choosing between adding a branch and adding a separate salon, when the
  choice is presented, then the difference in shared staff, shared reporting and subscription is
  stated before they choose.

---

# Success Criteria

- **The workaround disappears.** Zero new duplicate-account cases raised with support after release,
  measured as support requests of the form "I have two logins for my two salons" or requests to
  merge two accounts, compared against the same count before release.
- **Adoption by the intended customer.** Count of identities holding an active owner role at more
  than one salon, tracked from release. Any non-zero number confirms the block was real; the
  intended shape is steady growth from existing owners, not a spike of branch-shaped misuse.
- **The gate holds and stays visible.** Every identity holding more than one active ownership has a
  matching approval record naming an approver and a business reason — no exceptions, checked
  periodically. A grant without one means the gate was bypassed.
- **No chain-plan cannibalisation.** Count of multi-site operators running separate solo salons
  rather than one chain salon should not grow after release; a rise means the review gate is being
  used to buy the discount rather than to unblock genuine second businesses. Watch alongside chain
  plan retention.
- **Branches do not get misfiled.** Ratio of new salons that are additional branches of an existing
  owner's business versus genuinely separate businesses, and support requests asking to merge two
  separate salons back into one business. The second number should stay at or near zero; anything
  else means the guidance in requirement 23 is failing.
- **Correct-salon confidence.** No support cases attributable to an owner performing an action in
  the wrong salon (refund, payout, price change, staff change) in the first 90 days.
- **Co-ownership becomes visible.** Owners of co-owned salons can answer "who else owns this salon"
  without contacting support; measured as elimination of support requests asking us to confirm who
  the owners of a salon are.
- **No regression.** No increase in sign-in, navigation, or context-related support requests from
  single-salon users, who should see no change beyond the role label.
