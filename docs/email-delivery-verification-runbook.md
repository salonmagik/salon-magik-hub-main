# Email Delivery Verification Runbook

Produced by: `email-delivery-audit` (Implementation Design: `docs/design/email-delivery-audit.design.md`, AD-12).

Purpose: this covers FR-11 to FR-13 — the parts of the Planning Brief that require live
production access the pipeline does not hold (`docs/prd/email-delivery-audit.prd.md`, Open
Questions 1–3). Run each check against production, fill in the results table, and file any
correction that needs user action (FR-12) as its own follow-up.

**Do not paste secret values into this document or its results.** The checks below record
presence and validity only — never a decrypted secret value.

---

## 1. Are both cron jobs registered and enabled?

```sql
select jobname, schedule, active
from cron.job
where jobname in ('send-daily-digest', 'send-appointment-reminders');
```

Expect two rows, both `active = true`, with schedules `0 7 * * *` and `*/30 * * * *`.

## 2. Have they actually run recently, and did the runs succeed?

```sql
select jobid, status, return_message, start_time
from cron.job_run_details
where start_time > now() - interval '7 days'
order by start_time desc
limit 50;
```

Distinguishes "never ran" (no rows for a jobid that should have run) from "ran and failed"
(rows present with a non-success `status`/`return_message`) — the two failure modes that look
identical from source alone (Technical Brief, Unknowns).

## 3. Do the required Vault secrets exist? (names only — never values)

```sql
select name, created_at
from vault.decrypted_secrets
where name in (
  'daily_digest_function_url',
  'daily_digest_secret',
  'appointment_reminders_function_url',
  'appointment_reminders_secret'
);
```

Expect all four names present. If any are missing, the corresponding cron job has been a
silent no-op since registration (`net.http_post(url := NULL)`) — this is a production
configuration gap requiring `vault.create_secret` with the correct value, which only the user
can supply (FR-12).

## 4. Is the Resend API key valid and the sending domain verified?

```bash
curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains
```

Expect an authenticated response listing the sending domain with `"status": "verified"`. A
401/403 means the key is invalid; a domain present but not verified means outbound sends will
be rejected or land in spam regardless of the code fix — remediation needs DNS records only the
user can add (Planning Brief, Open Question 1).

## 5. Is the reporting owner's tenant actually opted into the digest?

```sql
select tenant_id, digest_frequency
from notification_settings
where tenant_id = '<reporting tenant>';
```

`digest_frequency` defaults to `off` (migration `20260906170000_digest_frequency.sql`,
2026-09-06) — if this tenant's value is `off`, symptom #1 (digest never sends) is expected
product behaviour, not a defect, and this alone may close that half of the report (Planning
Brief, Open Question 3). The default is deliberate and is not changed by this work.

## 6. Post-deploy: trigger one digest and one reminder, confirm real delivery (FR-13)

1. Trigger a digest manually for the reporting tenant:
   ```bash
   curl -s -X POST "$SUPABASE_URL/functions/v1/send-daily-digest" \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY_OR_USER_JWT" \
     -H "Content-Type: application/json" \
     -d '{"tenantId": "<reporting tenant>"}'
   ```
   A manual/scoped call bypasses `shouldSendToday`, so this sends regardless of the calendar
   day (existing, intentional behaviour). Confirm the response has `emailsFailed: 0` and
   `emailsSent > 0`, and confirm the email actually arrives in the owner's inbox.
2. Trigger a reminder run (or wait for the next `*/30 * * * *` cron tick) for an appointment
   inside its reminder window with email reminders enabled, and confirm the customer receives
   it.
3. For both, confirm a matching `message_logs` row exists:
   ```sql
   select id, channel, template_type, recipient, status, sent_at, error_message
   from message_logs
   where tenant_id = '<reporting tenant>'
     and created_at > now() - interval '1 hour'
   order by created_at desc;
   ```

---

## Results

| # | Check | Checked by | Date | Result |
|---|---|---|---|---|
| 1 | Cron jobs registered + enabled | | | |
| 2 | Cron jobs ran recently, without error | | | |
| 3 | Vault secrets present (names only) | | | |
| 4 | Resend key valid, domain verified | | | |
| 5 | Reporting tenant's `digest_frequency` | | | |
| 6 | Digest delivered to a real inbox + `message_logs` row | | | |
| 6 | Reminder delivered to a real inbox + `message_logs` row | | | |

Any row found missing or wrong: file the specific corrective action required (e.g. "create
Vault secret `daily_digest_secret` with value from …", "add DNS TXT record … to verify the
sending domain") as its own follow-up in `docs/backlog-open-followups.md`, per FR-12 — do not
perform the correction here if it requires access only the user holds.
