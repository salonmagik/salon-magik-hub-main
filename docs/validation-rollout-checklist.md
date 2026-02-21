# Validation Rollout Checklist

This checklist tracks migration to strict, shared validation conventions.

Status legend:
- DONE: migrated and smoke-tested
- PARTIAL: implemented in some paths but still has gaps
- TODO: not migrated yet

## Core standards

- Password checklist with CTA disabled until valid
- Country-aware phone validation and E.164 normalization
- Numeric-only quantity inputs (empty initial state)
- Money inputs formatted and sanitized consistently
- Inline errors + deterministic submit states

## App coverage

### Salon Admin

- Auth: forgot/reset password checklist and submit gating — PARTIAL
- Onboarding forms (country/phone/numeric constraints) — PARTIAL
- Catalog and customer forms — PARTIAL
- Remaining settings/forms — TODO

### Backoffice

- Plans/pricing flows — PARTIAL
- Feature flag rule modal parity with shared validation — TODO
- Remaining admin forms — TODO

### Marketing

- Waitlist + interest forms — PARTIAL
- Remaining form surfaces — TODO

### Public Booking

- Booker info + gift recipients country/phone constraints — PARTIAL
- Remaining booking entry forms — TODO

### Client Portal

- Validation migration pass — TODO

## Exit criteria

- Every form uses shared validators and sanitizers.
- Every primary CTA is disabled until form validity is true.
- Manual smoke pass completed for all apps and recorded.
