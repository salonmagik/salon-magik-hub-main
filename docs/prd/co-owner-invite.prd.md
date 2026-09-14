# Original Request

> Invite and accept flow for a co-owner (backlog item: co-owner-invite). Let an existing owner
> invite someone as a second owner, and let that person accept and get in. Should follow the
> existing staff-invitation patterns (`supabase/functions/send-staff-invitation`), including the
> temp-password onboarding convention already used for staff rather than magic links — this project
> does NOT use magic links / `generateLink` for tenant-user onboarding. Covers the invite UI in
> salon-admin, sending, acceptance, and revoking a pending invite.
>
> Its dependency, `co-owner-role`, is already done and merged on this branch, as is
> `multi-salon-owner-identity`.

Backlog item: `co-owner-invite` (`docs/backlog-open-followups.md`), status `in-progress`,
requires `co-owner-role`.

Input: the Technical Brief for this item, `docs/research/2026-09-12-co-owner-invite.md`.

---

# Summary

A salon owner can today only gain a co-owner by asking Salon Magik support to do it for them: the
only working co-owner grant path is a backoffice screen that requires a super-admin with a fresh
TOTP. This feature gives the owner that capability directly, in salon-admin, as a self-serve invite.

An owner opens an **Owners** surface in settings, sees who currently owns the salon, and invites one
other person by email. That person receives an email with a temporary password and a link to
`/login` — the same onboarding mechanic staff invitations already use, no magic links. On first
login they are forced to change their password, and **that act of accepting is what makes them an
owner**. Until then they hold no owner powers, and the inviting owner can revoke the pending invite
and nothing will have changed.

A salon can have at most two owners. The invited person may be brand new to the platform, or may
already work at this salon in another role (in which case accepting promotes them in place rather
than creating a duplicate account). A person who actively owns a *different* salon cannot be invited
through this self-serve path — that case remains support-mediated, as `multi-salon-owner-identity`
already decided.

Everything here is product behaviour. Which function, RPC or table each step routes through is an
engineering decision for the next stage, with one non-negotiable already established by research:
no code path may grant the `owner` role without going through the existing
`grant_tenant_co_owner` safety primitive.

---

# Problem Statement

1. **Co-ownership is unreachable by the people who need it.** The capability exists in the database
   and in backoffice, but an owner who wants to bring in a business partner has no way to do it
   themselves. Every co-owner addition today is a support ticket with a human on the Salon Magik
   side, which does not scale and delays the customer by hours or days.

2. **There is no owner-facing representation of co-ownership at all.** An owner cannot see whether
   their salon has a second owner, who it is, or that an invitation is outstanding. The
   `multi-salon-owner-identity` brief already identified this surface as entirely unbuilt.

3. **The obvious shortcut is dangerous.** The existing staff-invitation function accepts whatever
   role string it is handed and inserts it directly, with no owner cap, no promote-in-place
   handling, and no audit entry. Reusing it as-is for owner invitations would silently bypass every
   guarantee the co-owner work was built to provide. The absence of a proper owner-invite path makes
   an unsafe one more likely to be improvised later.

4. **Single-owner salons are a continuity risk for the customer.** A salon with one owner has one
   person who can access billing, payouts and staff administration. If that person is unavailable,
   the business is stuck waiting on support.

---

# Business Goal

- **Remove support from the critical path.** Co-owner additions become self-serve for the ordinary
  case (a partner who does not already own another salon), leaving support to handle only the
  genuinely exceptional cases it was reserved for.
- **Make a known-good capability sellable.** Co-ownership is a real differentiator for partnerships
  and family-run salons and cannot currently be demonstrated or used without Salon Magik staff.
- **Reduce account churn and duplicate identities.** A partner who cannot be added as an owner today
  either shares the owner's login (a security and audit problem) or gets a staff account that cannot
  do what they need.
- **Protect the platform's ownership invariants** by giving the owner-facing flow a correct,
  audited path instead of leaving the unguarded one as the tempting option.

---

# User Goal

**As an existing salon owner**, I want to invite my business partner to co-own my salon, see the
invitation's status, and cancel it if I change my mind — without contacting support.

**As the invited person**, I want to receive a clear email, sign in with the credentials it gives
me, set my own password, and land in the salon with full owner access.

**As either owner afterwards**, I want to see who else owns this salon, so co-ownership is visible
rather than invisible state.

---

# Scope

1. **Owners surface in salon-admin.** A view, reachable by an active owner of the salon, listing
   the salon's current owner(s) with name and email, plus any outstanding co-owner invitation and
   its status.
2. **Invite a co-owner.** An owner enters the prospective co-owner's email (and name, matching what
   the staff invite dialog collects) and sends the invitation.
3. **Pre-send validation with clear messaging.** Before sending, the system tells the owner if the
   email is not usable and why: the salon already has two owners; that person already owns this
   salon; that person actively owns a different salon (support-mediated, not self-serve); the email
   is already tied to an account that can't be used this way; or an invitation is already pending.
4. **Invitation email to the invited person**, carrying a temporary password and a link to the
   normal `/login` page, following the existing staff-invitation email pattern and the project's
   standing no-magic-link rule.
5. **Notification email to the existing owner(s)** when a co-owner invitation is sent, when it is
   accepted, and when it is revoked — mirroring the dual-email behaviour the backoffice co-owner
   flow already has.
6. **Acceptance.** The invited person signs in with the temporary password, is forced to set a new
   password, and on success becomes an active owner of the salon and lands in salon-admin with owner
   access. Acceptance is the moment the owner role is granted.
7. **Promote in place.** If the invited email belongs to someone who already holds a non-owner role
   at this salon, accepting converts them to owner rather than creating a second account; their
   previous role at this salon ends.
8. **Revoke a pending invitation.** An owner can cancel an outstanding co-owner invitation at any
   time before acceptance. After revocation the invitation can no longer be accepted, and the
   invited person gains no access to the salon.
9. **Resend a pending invitation**, re-issuing a **freshly generated** temporary password and
   restarting the expiry window.
10. **Expiry.** A co-owner invitation expires after 7 days, matching staff invitations; an expired
    invitation cannot be accepted and is shown as expired.
11. **Two-owner cap enforced at both ends** — an invitation cannot be sent when the salon already
    has two owners, and acceptance is refused if the second seat was taken in the meantime, with an
    explanatory message to the accepting person and to the owner.
12. **Audit trail.** Sending, accepting, and revoking a co-owner invitation are each recorded in the
    existing audit log, attributed to the acting user, consistent with the `co_owner_added` entry the
    backoffice flow already writes.
13. **Role label visibility.** Once accepted, both people are shown as "Owner" wherever salon-admin
    already displays the signed-in user's role.

---

# Out of Scope

- **Removing or demoting an existing co-owner**, and **transferring ownership** — these remain
  support-mediated, as previously decided. This feature only adds an owner; it never takes one away.
- **More than two owners per salon.** The cap stays at two.
- **Self-serve multi-salon ownership.** Inviting someone who actively owns a different salon stays
  blocked in this flow and continues to go through Salon Magik's reviewed grant.
- **Changes to backoffice's existing co-owner screen.** It continues to work as-is, as the
  support-mediated path for the exceptional cases.
- **Changes to staff invitations.** The staff invite dialog, its role list, and its behaviour are
  untouched. The pre-existing gap that its edge function does not whitelist the role it is handed is
  noted but is not this item's to fix (see Risks).
- **Per-owner permission differentiation.** Both owners have identical capabilities; there is no
  "primary owner", no reduced-permission co-owner, and no approval step where one owner must
  countersign the other's actions.
- **Inviting a co-owner from the client-facing app or the marketing site.** Salon-admin only.
- **Bulk or multiple simultaneous co-owner invitations.** One outstanding invitation at a time.
- **SMS delivery of the invitation.** Email only, matching staff invitations.

---

# Functional Requirements

**Access to the surface**

1. An active owner of the salon can reach the Owners surface in salon-admin.
2. A user who is not an active owner of the salon cannot reach the Owners surface, cannot see the
   current owner list through it, and cannot see, send, resend or revoke a co-owner invitation.
3. The Owners surface lists every active owner of the salon with their name and email.
4. The Owners surface shows any outstanding co-owner invitation, with the invited email, the date it
   was sent, and its status (pending, accepted, expired, revoked).

**Sending an invitation**

5. An owner can submit a co-owner invitation consisting of the invitee's email address and name.
6. The invite action is unavailable, with an explanation, when the salon already has two active
   owners.
7. The invite action is unavailable, with an explanation, when a co-owner invitation for this salon
   is already pending.
8. Submitting an invitation for an email that already belongs to an active owner of this salon is
   rejected with a message saying that person already owns this salon.
9. Submitting an invitation for an email belonging to someone who actively owns a different salon is
   rejected with a message stating this must be arranged with Salon Magik, without exposing which
   other salon.
10. Submitting an invitation for an email that already holds a non-owner role at this salon is
    accepted and proceeds as a promote-in-place invitation; the owner is told this person already
    works at the salon and will become an owner on acceptance.
11. Submitting an invitation for an email not otherwise usable (an account exists that cannot be
    used this way) is rejected with a message explaining the email cannot be invited, without
    revealing details of the other account.
12. Submitting an invitation for an email with no existing account creates the invitation for a new
    person.
13. A successfully sent invitation is recorded with status pending and an expiry 7 days from send.
14. Only one co-owner invitation per salon may be pending at a time.

**Emails**

15. On successful send, the invited person receives an email containing the salon's name, who
    invited them, that they are being invited as an owner, a temporary password, a link to `/login`,
    and the expiry date.
16. On successful send, every current active owner of the salon receives a notification email
    naming the invited email address.
17. On acceptance, every other active owner of the salon receives a notification email.
18. On revocation, the invited person receives an email stating the invitation was withdrawn, and
    every current active owner receives a notification.

**Acceptance**

19. The invited person can sign in at `/login` with the invited email and the temporary password
    from the email.
20. On first sign-in the invited person is required to set a new password before reaching any other
    part of salon-admin.
21. On successfully setting their new password, the invited person becomes an active owner of the
    salon, and the invitation is marked accepted with the acceptance time recorded.
22. An invited person who already held a non-owner role at this salon holds only the owner role
    afterwards; their previous role at this salon is no longer active.
23. Acceptance is refused, with an explanatory message, if the salon already has two active owners
    at the moment of acceptance.
24. Acceptance is refused, with an explanatory message, if the invited person has become the active
    owner of a different salon since being invited.
25. An invitation that is expired or revoked cannot be accepted; attempting to use its temporary
    password does not grant owner access to the salon.
26. Until acceptance completes, the invited person holds no owner role, and therefore no owner
    capabilities, at the salon.

**Revoking and resending**

27. An owner can revoke a pending co-owner invitation.
28. A revoked invitation is shown as revoked and cannot be accepted.
29. Revoking an invitation for someone who already held a non-owner role at this salon leaves that
    existing role untouched — they continue to work at the salon in their prior role.
30. Revoking an invitation for someone with no prior role at this salon leaves them with no access
    to the salon.
31. After revoking, an owner can send a new co-owner invitation (to the same or a different email).
32. An owner can resend a pending invitation; resending issues a newly generated temporary password,
    invalidates the previous one, restarts the 7-day expiry, and re-sends the invitation email.

**Audit**

33. Sending, accepting, resending and revoking a co-owner invitation each write an audit entry
    recording the salon, the acting user, the invited email, and the time.

---

# Non-functional Requirements

- **Security / least privilege.** Owner-level access is the most privileged role in a salon; every
  operation in this feature is restricted to active owners of that salon, and no path may grant the
  owner role without passing the platform's existing owner-grant safety checks (two-owner cap,
  single-active-role-per-salon, cross-salon owner uniqueness).
- **Credential handling.** A temporary password that confers owner access on acceptance must be
  single-use in effect: once a new password is set, or the invitation is revoked, resent or expired,
  the old temporary password must no longer grant access.
- **Identity checks are platform-wide.** Email/identity conflict checks span all salons, not just
  the current one, consistent with the existing platform rule.
- **Clarity of failure.** Every rejection path (cap reached, owns another salon, already an owner,
  expired, revoked) produces a specific, human-readable message — never a generic error or a raw
  database message.
- **Privacy.** Rejection messages must not disclose the name or identity of another salon, or
  details of another person's account, to the inviting owner.
- **Consistency.** The invite dialog, pending-invitation list and revoke interaction should read and
  behave like the existing staff invitation equivalents, so the flow is familiar. Scrollable
  containers keep scrollbars hidden, per the project's standing UI rule.
- **Accessibility.** The Owners surface and invite dialog meet the same keyboard and screen-reader
  standards as the existing staff invitation dialog.
- **Reliability.** A failure to send the invitation email must not leave the salon in a state where
  an invitation is recorded as pending but no-one can act on it; the owner must be able to resend or
  revoke.

---

# User Flow

**Inviting**

1. Owner opens salon-admin settings and selects **Owners**.
2. They see themselves listed as owner, and either "This salon has no co-owner" or the existing
   co-owner / the pending invitation.
3. They choose **Invite co-owner** and enter the person's name and email.
4. The system validates the email. If it cannot be invited, the owner sees a specific reason and can
   correct it.
5. On success, the dialog confirms the invitation was sent, and the Owners surface now shows a
   pending invitation with its expiry.
6. The owner receives a confirmation email; any other current owner receives a notification.

**Accepting**

7. The invited person receives an email: *"{Owner} has invited you to co-own {Salon} on Salon
   Magik"*, with a temporary password and a link to sign in.
8. They open `/login`, sign in with their email and the temporary password.
9. They are required to set a new password.
10. On success they land in salon-admin with owner access to the salon, and their role shows as
    Owner.
11. The inviting owner receives an email confirming the invitation was accepted, and the Owners
    surface now lists two owners with no pending invitation.

**Revoking**

12. Before acceptance, the owner opens **Owners**, selects the pending invitation, and chooses
    **Revoke**, confirming the action.
13. The invitation shows as revoked. The invited person's temporary password no longer works, and
    they receive an email saying the invitation was withdrawn.
14. The owner can now send a fresh invitation.

**Someone who already works at the salon**

15. Steps 1–11 are identical, except the owner is told at step 4 that this person already works at
    the salon and will become an owner when they accept, and the invited person signs in with their
    existing account rather than receiving a new one. On acceptance their previous role ends and
    they become an owner.

---

# Constraints

- A salon may have **at most two owners**. This is a deliberate product limit, not a technical one.
- A person may **actively own only one salon**. Exceptions are granted by Salon Magik under review;
  they are never self-serve, and this flow must not become a route around that.
- **Onboarding uses a temporary password and the normal `/login` page.** Magic links are not used
  for salon users on this platform, and this feature does not introduce an exception.
- **Owner removal, demotion and ownership transfer remain support-mediated** and out of this
  feature's reach, which means a mistaken invitation that has already been accepted can only be
  undone by contacting Salon Magik. This is an accepted consequence of the current model and is why
  revocation-before-acceptance must be reliable.
- **The backoffice co-owner path continues to exist** and must not be broken or duplicated by this
  feature; the two paths coexist, with backoffice retaining the exceptional cases.
- Every work item on this project gets a Jira ticket filed under the appropriate epic; this feature
  is expected to be tracked that way alongside the existing second-owner epic work.

---

# Assumptions

Autonomous-mode decisions are marked `(decided autonomously)` and can each be reversed individually
without disturbing the rest of the brief.

1. `Q: Should the owner-facing invite surface show the salon's current owner(s), the way the
   backoffice co-owner dialog does, or omit it? -> A: Yes — show them. A named "Owners" surface
   listing current owners is the smallest thing that makes co-ownership visible at all, which the
   prior multi-salon-owner brief flagged as a gap, and an owner confirming who already owns the
   salon before inviting is the same confirm-then-act shape the backoffice dialog already uses.
   Whether this reads from a new owner-scoped mechanism or a relaxed existing one is an engineering
   decision. (decided autonomously)`

2. `Q: Should an owner invitation create the invitee's account and grant the owner role immediately
   at invite time (matching today's staff invitation behaviour), or defer the grant until
   acceptance? -> A: Split them. The account may be created at invite time — the temporary-password
   login mechanic requires a signable-in account — but the **owner role is granted only on
   acceptance**. Owner is the most privileged role in a salon; an invitation sitting unaccepted in
   an inbox must not confer it, and revocation must actually mean the person never becomes an owner.
   This also puts the two-owner cap re-check at the moment ownership is actually conferred, which is
   the correct point to check it. The cost is one deliberate divergence from the staff-invitation
   pattern, which is justified by the difference in privilege. (decided autonomously)`

3. `Q: Should a non-owner tenant member (manager/supervisor) be able to see, revoke or resend a
   pending co-owner invitation, as they can for staff invitations today? -> A: No. Sending,
   viewing, resending and revoking a co-owner invitation are restricted to active owners of that
   salon. A manager being able to cancel — or, worse, initiate — the addition of an owner is a
   privilege inversion; the existing broad permission on staff invitations should not be inherited
   silently here. Existing staff-invitation permissions are unchanged. (decided autonomously)`

4. `Q: On resend, should the temporary password be reused (as staff resend does today) or
   regenerated? -> A: Regenerated, invalidating the previous one. An owner-level credential should
   not have two live copies in two inboxes, and resend is the owner's implicit signal that the first
   one should stop working. (decided autonomously)`

5. `Q: How many co-owner invitations may be outstanding at once? -> A: One per salon. With a cap of
   two owners, a second simultaneous invitation could only ever be a race that one party loses after
   receiving credentials. (decided autonomously)`

6. `Q: What expiry should a co-owner invitation have? -> A: 7 days, matching staff invitations —
   no reason found to diverge, and a shorter window would surprise owners familiar with the staff
   flow. (decided autonomously)`

7. `Q: Should the existing owner be notified when an invitation is sent, accepted, or revoked?
   -> A: Yes, all three. The backoffice flow already notifies the existing owner on a co-owner
   addition, and ownership changes are exactly the class of event an owner should never learn about
   by accident. (decided autonomously)`

8. It is assumed that the invited person's email is one they control; no additional email
   verification step beyond receiving and using the temporary password is introduced, consistent
   with how staff invitations work today.

9. It is assumed that both owners of a salon have identical capabilities, per the co-owner role
   already shipped; this feature introduces no owner sub-types.

---

# Risks

- **An accepted invitation cannot be undone in-product.** Because owner removal is support-mediated,
  an owner who invites the wrong person and lets it be accepted must contact Salon Magik. Mitigation:
  explicit confirmation of the email before sending, reliable revoke before acceptance, and
  notifying the existing owner at every stage. This risk should be weighed when prioritising a
  self-serve owner-removal item.
- **Self-serve ownership widens a social-engineering surface.** Someone who gains temporary access
  to an owner's session could invite themselves as a co-owner. Mitigation: notification emails to
  all current owners on send and accept give the legitimate owner a signal, and the audit trail
  makes it recoverable. A step-up verification for this action was considered and deliberately not
  added, to keep the flow self-serve; it is a candidate follow-up if abuse appears.
- **Platform-gaming pressure on the one-salon-per-owner rule.** Making co-ownership self-serve
  increases the number of people probing what ownership allows. The cross-salon restriction stays
  enforced and support-mediated, which is what contains this — but the rejection message at FR-9 is
  the moment customers will push back, and support should expect the volume.
- **Divergence from the staff-invitation pattern is a maintenance cost.** Granting the role at
  acceptance rather than at invite time means the two invitation flows behave differently at a point
  where they look identical. Mitigation: the difference is deliberate and documented here; the
  staff flow is not changed.
- **Pre-existing gap, not introduced here:** the staff invitation function does not restrict which
  role it will grant. This feature does not rely on or widen that, but the gap remains until
  addressed separately, and it should be raised as its own backlog item rather than fixed
  incidentally inside this one.
- **Support-path confusion.** Two co-owner paths now exist (self-serve and backoffice). Support
  needs to know which applies when, or customers will get inconsistent answers.

---

# Open Questions

1. **Is self-serve co-ownership available on every plan, or gated to specific plans?** Co-ownership
   is a plausible paid differentiator, and this feature makes it customer-visible for the first
   time. This is a pricing and packaging decision that cannot be made from the repository or from
   this request; the brief assumes no plan gate, and if a gate is wanted it adds a precondition at
   FR-5.
2. **Does adding a co-owner consume a staff seat?** The staff invitation flow checks a seat gate
   before inviting. Whether an owner counts against the salon's seat allowance is a commercial
   decision. The brief assumes it does not, since owners are not staff seats, but this should be
   confirmed against how plans are sold.
3. **Should support be given a way to see pending self-serve co-owner invitations in backoffice?**
   Useful for handling "I never got the email" tickets; not required for the feature to work, and
   deliberately left out of Scope pending a call on whether support needs it.

---

# Acceptance Criteria

**Surface and access**

1. *Given* I am an active owner of a salon, *when* I open salon-admin settings, *then* I can reach
   an Owners surface listing the salon's current owner(s) by name and email.
2. *Given* I am a manager, supervisor, receptionist or staff member, *when* I look for the Owners
   surface, *then* it is not available to me, and I cannot send, view, resend or revoke a co-owner
   invitation by any route in salon-admin.
3. *Given* my salon has one owner and no invitation, *when* I open the Owners surface, *then* I see
   an option to invite a co-owner.

**Sending**

4. *Given* I am the sole owner, *when* I invite an email with no existing account, *then* the
   invitation is recorded as pending with an expiry 7 days out, the invited person receives an email
   containing a temporary password and a `/login` link, and I receive a confirmation.
5. *Given* my salon already has two active owners, *when* I open the Owners surface, *then* the
   invite option is unavailable and I am told the salon already has the maximum of two owners.
6. *Given* a co-owner invitation is already pending, *when* I try to send another, *then* it is
   refused and I am told an invitation is already outstanding.
7. *Given* I invite the email of someone who already owns this salon, *when* I submit, *then* it is
   refused with a message saying that person already owns this salon, and no email is sent.
8. *Given* I invite the email of someone who actively owns a different salon, *when* I submit,
   *then* it is refused with a message telling me to contact Salon Magik, the other salon is not
   named, and no invitation is created.
9. *Given* I invite the email of someone who already holds a non-owner role at this salon, *when* I
   submit, *then* the invitation is created, and I am told they already work here and will become an
   owner on acceptance.
10. *Given* a second owner exists, *when* I send an invitation, *then* the other owner receives a
    notification email naming the invited address.

**Accepting**

11. *Given* a pending invitation, *when* the invited person signs in at `/login` with the temporary
    password, *then* they are required to set a new password before reaching anything else.
12. *Given* the invited person sets their new password, *when* it succeeds, *then* they hold the
    owner role for the salon, land in salon-admin with owner access, see their role as Owner, the
    invitation shows as accepted, and the inviting owner receives a notification.
13. *Given* an invitation is pending and not yet accepted, *when* the invited person attempts any
    owner-only action, *then* they have no owner access to the salon.
14. *Given* the invited person already held a non-owner role at this salon, *when* they accept,
    *then* they hold the owner role and no longer hold their previous role at this salon.
15. *Given* a second owner was added by another route after the invitation was sent, *when* the
    invited person tries to accept, *then* acceptance is refused with a message saying the salon
    already has two owners, and they are not granted the owner role.
16. *Given* the invited person became the active owner of a different salon after being invited,
    *when* they try to accept, *then* acceptance is refused with an explanatory message and no owner
    role is granted for this salon.
17. *Given* an invitation has passed its 7-day expiry, *when* the invited person tries to sign in
    with the temporary password, *then* they do not gain owner access, and the invitation shows as
    expired to the owner.

**Revoking and resending**

18. *Given* a pending invitation, *when* I revoke it, *then* it shows as revoked, the invited person
    receives a withdrawal email, and the temporary password no longer grants access to the salon.
19. *Given* I revoked an invitation for someone with no prior role here, *when* they attempt to sign
    in, *then* they have no access to the salon.
20. *Given* I revoked an invitation for someone who already worked here in another role, *when* they
    sign in, *then* they still have exactly their previous role, unchanged.
21. *Given* I revoked an invitation, *when* I return to the Owners surface, *then* I can send a new
    invitation.
22. *Given* a pending invitation, *when* I resend it, *then* the invited person receives a new email
    with a newly generated temporary password, the previous temporary password no longer works, and
    the expiry restarts at 7 days.

**Audit**

23. *Given* any of send, accept, resend or revoke occurs, *when* the audit log is inspected, *then*
    there is an entry recording the salon, the acting user, the invited email and the time.

---

# Success Criteria

- **Support load:** co-owner additions handled by Salon Magik support drop to near zero for the
  ordinary case within one month of release; the backoffice path is used only for cross-salon and
  removal/transfer cases.
- **Completion rate:** at least 70% of co-owner invitations sent are accepted within their 7-day
  window. A materially lower rate points at the email or the temporary-password step and warrants
  investigation.
- **Adoption:** the number of salons with two active owners increases relative to the pre-release
  baseline, which is effectively zero outside support-created cases.
- **Correctness:** zero salons end up with more than two active owners, zero people end up actively
  owning more than one salon through this flow, and zero owner roles are granted outside the
  audited grant path. Any single occurrence is a defect, not a metric.
- **Error quality:** a negligible share of invitation attempts end in a generic or unexplained
  error; rejections are attributable to a specific, intended reason.
- **Support signal:** no increase in "I was removed as owner" or "someone I don't know owns my
  salon" contacts, which would indicate the social-engineering risk materialising.
