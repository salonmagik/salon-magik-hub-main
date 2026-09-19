# Security review report

Date: 2026-09-19

This review covered the Supabase Edge Functions, salon-admin messaging UI, repository tooling, environment-file patterns, and tracked generated artifacts. “Hacker proof” is not a finite state; this pass removes the highest-impact issues found in the reviewed paths and records the remaining decisions needed before production hardening is complete.

## Findings fixed in this pass

### SEC-001 — Unauthorised service-role email operations (High) — fixed

Affected paths: `supabase/functions/send-appointment-notification/index.ts`, `send-booking-approval-email/index.ts`, and `send-invoice/index.ts`.

These functions create service-role clients and send email. Before this change, a caller could invoke the endpoints without proving either that it was an internal service call or that the signed-in user belonged to the salon associated with the record. The functions now require a bearer token, distinguish trusted service-role calls from user sessions, and enforce active `user_roles` membership for browser callers. JWT verification is enabled for these functions in `supabase/config.toml`.

### SEC-002 — Stored salon-authored HTML rendered in the browser (High) — fixed

Affected path: `apps/salon-admin/src/pages/salon/MessagingPage.tsx`.

The email preview previously used raw HTML rendering for message content. A salon user could place markup or script-capable attributes in a message and execute it in the admin origin when the preview opened. The preview now renders text and a deliberately limited markdown subset as React nodes; links are restricted to `http` and `https` and use `rel="noreferrer"`.

### SEC-003 — Super-admin bootstrap was callable with an ordinary session (High) — fixed

Affected path: `supabase/functions/provision-super-admin/index.ts`.

The one-time bootstrap now requires the operator-only `PROVISION_SUPER_ADMIN_SECRET` function secret in the `x-provisioning-secret` header. A missing or incorrect secret returns a generic 404 so the endpoint does not disclose its existence.

### SEC-004 — Predictable security codes and generated passwords (High) — fixed

Affected paths: OTP functions, staff/tenant-owner invitation password generation, public booking references, and salon voucher generation.

Security-sensitive values no longer use `Math.random()`. They now use Web Crypto randomness, including rejection sampling for unbiased bounded integers.

### SEC-010 — Transfer approval callback accepted unsigned requests (High) — fixed

Affected paths: `supabase/functions/paystack-transfer-approval-ng/index.ts` and `paystack-transfer-approval-gh/index.ts`.

The callback previously warned when the request did not match a Paystack IP but still approved a matching pending withdrawal. It now accepts only a valid country-specific `x-paystack-signature` or a request from Paystack’s documented IP range; an invalid supplied signature or unknown source is rejected before the withdrawal record is read or approved.

### SEC-011 — Salon wallets were tenant-wide, not branch-scoped (High for chain plans) — fixed

Migration `20260919120000_branch_scoped_salon_wallets.sql` adds central and branch wallet scopes, attributes chain booking/invoice credits to the appointment branch, scopes withdrawal reservations and Paystack availability checks, and prevents a destination from being used for another branch. `20260919123000_branch_scoped_refund_wallets.sql` resolves refund clawbacks against the wallet that received the original credit. Payouts, settings, and reports now carry the selected branch scope; lifetime earned reporting uses the scoped wallet ledger. Legacy central/unassigned money remains explicitly separate rather than being silently reassigned.

## Remaining risks and required follow-up

### SEC-005 — Public invoice payment-session endpoint (Medium) — open, likely intentional

`create-invoice-payment-session` is configured with `verify_jwt = false` because invoice links are public. The endpoint accepts an invoice UUID and can create a Paystack session for that invoice. Treating the UUID as the only capability means anyone who obtains it can attempt to start payment. Before production, bind the link to a signed, expiring, single-use public payment token (and rate-limit attempts), or document the UUID as the intended public capability and add monitoring.

### SEC-006 — Outbound email HTML interpolation (Medium) — open

`supabase/functions/_shared/email-template.ts` and several notification functions interpolate salon/customer/appointment data into HTML strings. This is not browser DOM XSS, but unescaped names, notes, or URLs can alter recipient email markup or create phishing links. Add one shared `escapeHtml` function for text interpolation and an allow-listed URL sanitizer for every `href`/`src`; preserve HTML only for trusted template constants.

### SEC-007 — Wildcard CORS on Edge Functions (Low/Medium) — open

Many functions return `Access-Control-Allow-Origin: *`. This is not an authorization boundary by itself, but production browser APIs should allow only the deployed Salon Magik origins wherever a function is not deliberately public. Keep webhook endpoints non-browser-facing and verify their signatures independently.

### SEC-008 — Internal CSS sink in chart UI (Low) — open

`packages/ui/src/ui/chart.tsx` uses `dangerouslySetInnerHTML` to emit CSS from chart configuration. The configuration is expected to be internal, but validate identifiers/colors or replace the generated style block with CSS variables if chart settings become user-authored.

### SEC-009 — Account/customer enumeration surfaces (Low/Medium) — open

`auth-resolve-identifier` and `public-booking-email-lookup` are intentionally unauthenticated lookup flows. They should continue to return non-distinguishing responses where possible, use strict rate limits, and avoid exposing more tenant/customer data than the next login or booking step requires.

These open items are context-sensitive rather than proof of an exploitable defect in every deployment: public invoice links, lookup flows, wildcard CORS, and internal chart CSS can all be valid product choices when their capability tokens, rate limits, RLS policies, and inputs are controlled. They remain recorded because those assumptions should be made explicit and tested in the production configuration.

## Repository and secret review

- The obsolete `tasks/` PRDs/QA note were removed.
- The destructive reset SQL files under `supabase/scripts/` were removed. The reset runbook now points to a separately controlled operator procedure and requires environment confirmation, backups, and the protected bootstrap secret.
- Generated Playwright screenshots/logs were removed from the working tree. The remaining untracked design notes are documentation, not screenshots.
- No actual secret values were found in tracked source. `apps/salon-admin/.env.playwright` contains client-side `VITE_*` configuration; publishable Supabase values and a Turnstile site key are not substitutes for server secrets. Paystack/Resend/service-role secrets must remain in Supabase/deployment secret storage.

## Validation

- Salon-admin TypeScript check: passed.
- Client-portal TypeScript check: passed.
- Salon-admin production build: passed.
- Branch-wallet SQL migration reset: passed against the local Supabase/Docker database.
- Branch-wallet and existing refund SQL scenarios: executed without SQL errors against the local database (the CLI’s legacy TAP wrapper reports “no plan” for these `DO`-block scripts).
- `process-salon-withdrawal` Deno check: passed.
- Backoffice TypeScript check and production build: passed.
- Client-portal tests: 11/11 passed.
- Shared auth/random helpers and the changed notification/booking functions passed `deno check` where dependencies were available.
- The full salon-admin test run had one unrelated timeout in `CancelSubscriptionDialog.test.tsx`; the changed security paths were not involved.
- One `send-invoice` Deno check was blocked by the sandbox’s inability to download an existing `deno.land` dependency.
