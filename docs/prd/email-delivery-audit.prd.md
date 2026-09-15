# Original Request

> Audit every outbound email path on the platform. Reported symptoms from the user (2026-09-15): the
> daily digest never sends, and email reminders do not work. Treat those as the entry point, not the
> scope — investigate every outbound email the platform sends (Resend transactional sends,
> scheduled/cron-driven sends, booking receipts, invitations, notification emails) and establish, per
> path, whether it actually reaches a recipient today. Separate "never fires at all" (scheduler/cron/
> trigger not wired or not running) from "fires but delivery fails" (Resend config, domain/sender
> verification, errors swallowed). Confirm live where you can rather than from source alone. The goal
> is both diagnosis and repair: fix the confirmed defects. Anything that turns out to be a missing
> capability rather than a breakage — emails the product should be sending and simply never had — must
> be written up and flagged to the user as a gap, and filed as its own backlog item, not silently built
> here. Work in the feat/second-owner-foundation worktree.

Upstream input: `docs/research/2026-09-15-email-delivery-audit.md` (Researcher, 2026-09-15). Diagnosis
is complete at the source level; the "confirm live" half of the request was not executable in that
role's environment and carries forward into this brief as scoped work.

---

# Summary

Salon owners are not receiving two categories of email they are configured to receive: the daily
digest and appointment reminders. Source analysis has identified a confirmed defect class that explains
the symptoms and extends well beyond them: outbound email failures are silently discarded. The shared
`sendResendEmail` helper never reports a failed send to its caller and never records one, and the
appointment-reminders job never checks whether the email it requested was actually sent — while still
marking the appointment as reminded, permanently. Nine send paths share the first defect, covering most
of the platform's operational email to owners and managers.

This work delivers three outcomes: (1) every outbound email path reports and records its delivery
outcome, so a failure is visible rather than invisible; (2) a failed appointment reminder is retried
rather than silently abandoned; (3) the live production configuration that source analysis could not
reach — cron schedules, Vault secrets, Resend key and sender-domain verification — is verified against
a real send and the result written down.

Missing capabilities discovered along the way are documented and filed as backlog items, not built here.

---

# Problem Statement

A salon owner who has opted into the daily digest does not receive it. A salon owner whose appointment
reminders are switched on (the default) has customers who do not receive them. In both cases the
platform reports success: the digest function returns `{ success: true }` regardless of outcome, the
reminders job counts emails as sent without confirming they were, and neither writes a delivery record.

The consequences compound:

- The owner cannot tell that email is failing. There is no error, no alert, and no delivery log entry
  to inspect — the product's behaviour is indistinguishable from "no email was due".
- Customers miss appointment reminders, which drives no-shows — the specific business outcome
  reminders exist to prevent.
- A reminder that fails is never retried. The appointment is marked as reminded at the moment of the
  attempt, not on success, so the next scheduled run skips it forever.
- The same silent-failure pattern covers new-booking notifications, cancellation notifications,
  low-balance alerts, payout notifications and payment receipts. Any of these may be failing today with
  no evidence either way.

Separately, nobody has yet confirmed whether the production scheduling and email-provider configuration
is correct. Source analysis shows the cron jobs are registered in migrations, but the URLs and secrets
they depend on live in Supabase Vault and are applied outside of migrations. If those were never
created, the jobs no-op silently and forever — a failure mode externally identical to the swallow
defect. Until a live check is done, it is not known whether the code defects are the whole explanation
or only part of it.

---

# Business Goal

Reminders reduce no-shows; digests are a retention and engagement surface that keeps owners returning
to the product. Both are features salons are paying for and currently not receiving, which is a churn
and trust risk in the run-up to beta.

More durably: the platform currently has no way to answer the question "did our email actually get
delivered?" for most of its operational email. Making delivery outcomes observable turns email from an
unverifiable claim into something support can diagnose in minutes, and prevents this class of silent
regression recurring across the nine paths that share the defect.

---

# User Goal

**As a salon owner**, I want the daily digest to arrive when I have opted into it, and I want to be able
to tell whether it was sent, so I can rely on it as a daily view of my business.

**As a salon owner**, I want appointment reminders to actually reach my customers, and to be retried
if a send fails, so reminders reduce no-shows rather than silently doing nothing.

**As a salon owner or support agent**, I want a record of every email the platform attempted, including
the ones that failed and why, so a delivery problem can be diagnosed rather than guessed at.

---

# Scope

1. **Delivery outcomes are reported and recorded for every outbound email path.** Every outbound email
   the platform sends — across all paths that today use the shared sender, plus the appointment-reminder
   email leg — must produce a durable delivery record capturing at minimum: the tenant, the recipient,
   the message type, the outcome (sent / failed), and on failure the provider's reason. A failed send
   must be observable to the code that requested it, rather than discarded.

2. **Callers act on failure.** Functions that request an email must not report success when the email
   was not sent. Specifically, the daily digest must not report success for recipients whose email
   failed, and the appointment-reminders job must not count a reminder as sent unless the downstream
   send actually succeeded.

3. **Failed appointment reminders are retried.** An appointment is marked as reminded only when a
   reminder was actually delivered on at least one channel. A failed reminder is retried on subsequent
   scheduled runs, bounded so a permanently-bad recipient cannot retry indefinitely (see FR-7).

4. **All nine paths sharing the silent-swallow defect are covered**, not only the two the user reported:
   daily digest, new-booking notifications, cancellation notifications, low-balance alerts, payout
   notifications, payout-destination notifications, withdrawal notifications, and payment-webhook
   receipts. These share a single sender; the fix is shared with them.

5. **Live production verification.** Confirm against the running production environment, and write the
   result down:
   - whether the `pg_cron` jobs for the digest and for appointment reminders exist, are enabled, and
     have run recently;
   - whether the Vault secrets those jobs depend on exist and hold correct values;
   - whether the Resend API key is valid and the sending domain is verified in the live Resend account;
   - the reporting owner's own tenant `digest_frequency` value (this alone may explain symptom #1 —
     the default is `off`).

6. **Confirmed end-to-end send.** At least one digest and one appointment reminder observed arriving at
   a real inbox after the fix, with the corresponding delivery records present.

7. **Gap write-up.** Emails the product arguably should send but has never had are documented and filed
   as their own backlog items, flagged to the user — not built as part of this work.

---

# Out of Scope

- **A new owner-facing UI for email delivery status or failure alerts.** Making failures *recorded* is
  in scope; building a screen, alert, or notification that surfaces them to owners is a new capability
  and is filed as its own backlog item (see FR-10).
- **Retroactively resending reminders for appointments already marked as reminded.** Backfilling would
  send reminders for appointments that have since passed or are imminent, which is worse than sending
  nothing. Reminder retry applies going forward only.
- **Changing the `digest_frequency` default from `off`.** That default was set deliberately nine days
  ago (2026-09-06). Verification reports the value; it does not change it.
- **Changing which emails are sent, to whom, or their content, copy, or templates.** This is a delivery
  correctness pass, not a redesign of the email surface.
- **Replacing or adding an email provider.** Resend remains the sole provider.
- **SMS delivery.** The SMS leg of appointment reminders already records success and failure correctly
  and is the reference pattern here, not a target for change.
- **Building any missing-capability email discovered during the audit.** Written up and filed only, per
  the original request.

---

# Functional Requirements

**Delivery visibility**

1. Every outbound email send attempt across all paths in Scope §1 produces a durable delivery record,
   whether it succeeds or fails.
2. A delivery record for a failed send includes a human-readable reason sufficient to distinguish
   provider rejection, invalid recipient, authentication failure, and template failure.
3. A failed send is reported to the calling code rather than discarded. No send path may treat an
   unsuccessful provider response as a success.
4. Delivery records are attributable to a tenant and queryable per tenant, matching how SMS delivery
   records already behave.

**Caller correctness**

5. The daily digest reports, per run, how many recipient emails succeeded and how many failed. A run in
   which every send failed must not report unqualified success.
6. The appointment-reminders job counts a reminder email as sent only when the downstream send
   succeeded. A non-success response from the downstream send is recorded as a failure.

**Reminder retry**

7. An appointment is marked as reminded only if at least one channel (email or SMS) succeeded. If all
   enabled channels fail, the appointment remains eligible for retry on the next scheduled run, up to a
   maximum of 3 total attempts, after which it is marked as attempted-and-failed and not retried again.
8. Retries never cause a customer to receive more than one successful reminder for the same
   appointment.
9. Retries stop once the appointment's reminder window has passed — a reminder is not sent after the
   appointment start time.

**Gap handling**

10. Any email the product should plausibly send but has never had, identified during this work, is
    written up with the user-visible gap it represents and filed as a backlog item. At minimum, the
    absence of any owner-facing visibility into email delivery failures is filed this way.

**Live verification**

11. The production state of each item in Scope §5 is verified and the outcome recorded in a written
    verification record: what was checked, how, when, and the result.
12. Any production configuration found to be missing or wrong (absent cron job, missing or incorrect
    Vault secret, unverified sending domain) is either corrected, or — where correction requires access
    or action only the user can take, such as DNS changes — reported to the user with the specific
    action required.
13. A digest email and an appointment reminder email are each confirmed to arrive at a real inbox after
    the fix, with matching delivery records.

---

# Non-functional Requirements

- **Reliability.** A failure in one recipient's email must not abort a whole scheduled run. A run
  continues through remaining recipients and reports the aggregate outcome.
- **Observability.** Delivery outcomes are durable and queryable after the fact, not only present in
  function logs.
- **Data protection.** Delivery records must not store email body content or customer personal data
  beyond the recipient address and message type already recorded for SMS.
- **Backward compatibility.** Existing successful email behaviour is unchanged — recipients, content,
  timing and opt-in semantics stay exactly as they are today.
- **Cost.** Retry behaviour must not materially increase provider send volume; bounded retries apply
  only to sends that genuinely failed.

---

# User Flow

**Digest, working as intended**

1. An owner sets their digest frequency to daily.
2. Each morning the scheduled job runs and sends that tenant's digest to owners and managers.
3. The owner receives the digest. A delivery record exists for each recipient.
4. If a send fails, the run records the failure with a reason and continues to the remaining recipients
   and tenants. The run's result distinguishes successes from failures.

**Appointment reminder, working as intended**

1. A customer books an appointment. The tenant has email reminders enabled (the default) at 24 hours
   before.
2. The scheduled job runs, finds the appointment inside its reminder window, and sends the reminder.
3. The customer receives it. A delivery record is written, and the appointment is marked as reminded.
4. If the send fails, the failure is recorded with a reason, the appointment is *not* marked as
   reminded, and the next scheduled run retries — up to three attempts total, and never after the
   appointment has started.
5. After three failed attempts the appointment is marked attempted-and-failed with the reason retained,
   and is not retried again.

**Support diagnosing a report of "email isn't arriving"**

1. An owner reports a missing email.
2. Support queries that tenant's delivery records for the relevant period.
3. The records show either that no send was due, that a send succeeded, or that a send failed with a
   specific reason — each of which points to a different next action. Today all three are
   indistinguishable.

---

# Constraints

- Salons are on the platform and receiving (or failing to receive) this email today. Changes must not
  alter who receives what, or introduce duplicate emails to customers.
- Beta ships only after payments end-to-end testing passes; this work runs alongside that gate and must
  not destabilise it.
- Deployment follows the established branch-promotion workflow — no direct production deploy.
- Work happens in the `feat/second-owner-foundation` worktree, per the original request.
- Every work item arising from this brief gets its own Jira ticket filed under an epic, including the
  backlog items filed for gaps.
- Live production verification depends on access the pipeline does not itself hold. Where a check or a
  correction requires credentials or account access only the user has, the requirement is satisfied by
  reporting the precise action needed rather than by performing it.

---

# Assumptions

- Q: The user reported two symptoms (digest, reminders), but the same silent-failure defect covers nine
  send paths. Should the fix cover all nine, or only the two reported? -> A: All nine. They share one
  sender; fixing only the reported two would leave an identical latent defect in new-booking,
  cancellation, low-balance, payout and receipt email, and the original request explicitly scopes the
  work to "every outbound email path", not just the reported symptoms. (decided autonomously)
- Q: Should a failed appointment reminder be retried, given the current code deliberately marks
  appointments as reminded on attempt "so we don't retry endlessly on a bad phone/email"? -> A: Yes,
  bounded to 3 total attempts and never past the appointment start time. Without retry, making failures
  visible would surface the problem without fixing the user's actual complaint that reminders don't
  arrive. The bound preserves the original intent of not looping forever on a bad recipient.
  (decided autonomously)
- Q: How many retry attempts, specifically? -> A: 3. Enough to clear transient provider failures, small
  enough to be obviously safe on send volume and cost. No evidence in the request or backlog favours a
  different number; 3 is the conventional choice. (decided autonomously)
- Q: Should reminders be retroactively resent for appointments already marked as reminded by a silently
  failed send? -> A: No. Those appointments have largely passed or are imminent; a late reminder is
  worse than none and risks a burst of confusing email to customers. Out of Scope, going-forward fix
  only. (decided autonomously)
- Q: The digest defaults to `off`, so the reporting user may simply never have opted in — should the
  default change to make digests arrive? -> A: No. That default was set deliberately on 2026-09-06.
  Verification reports the reporting tenant's actual value, which may turn out to be the entire
  explanation for symptom #1, but the default stands. (decided autonomously)
- Q: Should owners be shown their email delivery failures in the product? -> A: Not in this work.
  Recording failures is in scope; surfacing them in a UI is a new capability, which the original request
  requires be filed as a backlog item rather than built here. Filed as FR-10. (decided autonomously)
- Q: Live verification could not be performed by the upstream role for lack of production access — does
  that block this work? -> A: No. The code defects are confirmed from source and can be fixed
  independently. Verification is scoped as its own requirement, satisfied either by performing the check
  or by reporting the precise action the user must take where access is the blocker. (decided
  autonomously)
- Q: Does the delivery record need to be a new concept? -> A: No — SMS reminders already write delivery
  records and that is the established pattern to bring email in line with. This brief specifies the
  behaviour required, not the mechanism. (decided autonomously)

---

# Risks

- **The code fix may not be the whole cause.** If the production Vault secrets or cron jobs were never
  created, or the Resend sending domain is unverified, email will still not arrive after a correct code
  fix. This is why live verification and a confirmed real-inbox send are requirements rather than
  optional follow-ups — without them the work can appear complete while the user's symptom persists.
- **Making failures visible may reveal a much larger existing failure rate** across booking,
  cancellation, payout and receipt email than anyone currently believes. That is the point of the work,
  but it may expand remediation beyond this brief. Treat a large discovered failure volume as a finding
  to report, not as scope to absorb silently.
- **Retry could produce duplicate customer emails** if success detection is imperfect — a customer
  receiving the same reminder repeatedly is a worse experience than receiving none. FR-8 makes this an
  explicit acceptance condition.
- **Timing against the beta gate.** This touches scheduled jobs and shared notification code adjacent
  to payments receipts, while payments end-to-end verification is the gate for beta.
- **Access dependency.** If the user cannot supply production access, FR-11 to FR-13 cannot be
  completed, and the work ships as an unverified fix. That outcome must be reported plainly rather than
  presented as a resolved issue.

---

# Open Questions

1. Is the Resend sending domain verified and the API key valid in the live Resend account? Requires
   account access nobody in the pipeline holds. If the domain is unverified, remediation needs DNS
   changes only the user can make, which would extend the timeline.
2. Do the required Supabase Vault secrets for both cron jobs exist in production with correct values?
   If they were never created, the scheduled jobs have been no-ops since registration and the code fix
   alone will not produce a single email.
3. Is the reporting owner's own tenant `digest_frequency` set to anything other than `off`? If it is
   `off`, symptom #1 is expected product behaviour rather than a defect, and the digest half of the
   report closes on that answer.

All three are answered by the verification in FR-11 and do not block starting the code fix.

---

# Acceptance Criteria

**Delivery visibility**

- Given any outbound email path in Scope §1, when a send succeeds, then a delivery record exists for
  that tenant and recipient marked as sent.
- Given any outbound email path in Scope §1, when the provider rejects a send, then a delivery record
  exists marked as failed, carrying a reason that identifies the cause.
- Given a send fails, when the calling function completes, then that function does not report the send
  as successful.

**Digest**

- Given a tenant opted into a daily digest, when the scheduled run executes and the send succeeds, then
  the owner receives the digest and a delivery record marked sent exists.
- Given a tenant opted into a digest, when every recipient send fails, then the run does not report
  unqualified success and a failure record exists per recipient.
- Given a digest run covering several tenants, when one tenant's send fails, then the remaining tenants
  are still processed.
- Given a tenant whose digest frequency is `off`, when the scheduled run executes, then no digest is
  sent and no failure is recorded — unchanged from today.

**Reminders**

- Given an appointment inside its reminder window with email reminders enabled, when the reminder
  succeeds, then the customer receives it, a delivery record marked sent exists, and the appointment is
  marked as reminded.
- Given the same appointment, when the email send fails and no other channel succeeded, then the
  appointment is not marked as reminded and a failure record exists.
- Given an appointment whose reminder previously failed, when the next scheduled run executes and the
  appointment is still within its window, then the reminder is attempted again.
- Given an appointment whose reminder has failed three times, when the next scheduled run executes,
  then no further attempt is made and the appointment is marked attempted-and-failed.
- Given an appointment whose start time has passed, when a scheduled run executes, then no reminder is
  sent regardless of remaining attempts.
- Given an appointment whose reminder succeeded, when subsequent scheduled runs execute, then the
  customer receives no further reminder for that appointment.

**Verification**

- Given the fix is deployed, when live verification is performed, then a written record exists stating
  for each of: digest cron job, reminders cron job, both sets of Vault secrets, Resend key validity,
  sending-domain verification, and the reporting tenant's digest frequency — what was checked, when,
  and the result.
- Given the fix is deployed, when a digest and an appointment reminder are triggered, then both are
  confirmed to arrive at a real inbox and both have matching delivery records.
- Given a production configuration problem is found that requires user action, when the work is
  reported, then the specific action required of the user is stated explicitly.

**Gaps**

- Given a missing email capability is identified, when the work is reported, then it appears in the
  backlog as its own item and is flagged to the user, and no such capability has been built as part of
  this work.

---

# Success Criteria

- **The reported symptoms are resolved or explained.** The owner receives their daily digest, or is
  told their digest frequency was `off`; customers receive appointment reminders. Confirmed by real
  inbox delivery, not by a green function response.
- **Email delivery becomes diagnosable.** For any tenant and period, it is possible to answer "was this
  email sent, and if not why" from delivery records — currently impossible for the majority of the
  platform's operational email.
- **Silent failure is eliminated as a class.** No outbound email path reports success for a send that
  did not happen.
- **Reminder delivery rate is measurable, and failed reminders are recovered** rather than abandoned —
  measured as the proportion of due reminders that end in a recorded successful send.
- **Reduced support load** from "I didn't get the email" reports, which currently cannot be
  investigated at all.
- **No regression in customer experience** — no duplicate reminders, no change to who receives what.
