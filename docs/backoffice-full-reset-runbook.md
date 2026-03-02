# Backoffice Full Reset Runbook (Dev / Staging / Prod)

## Scope
This runbook wipes backoffice-domain data, sales ops/KYC/revenue-ops data, and backoffice auth users.
It also resets marketing master toggles (`waitlist_enabled`, `other_countries_interest_enabled`) to OFF.

## Pre-flight (per environment)
1. Confirm target project ref:
   - `supabase link --project-ref <PROJECT_REF>`
   - `cat supabase/.temp/project-ref`
2. Freeze deploys/feature writes during reset window.
3. Take backups:
   - `supabase db dump --linked -f backup-<env>-<timestamp>.sql`
   - Storage inventory export for `sales-agent-kyc-docs`
   - Capture current super admin emails/ids

## Apply schema simplification first
Run migrations before reset:
- `supabase db push --include-all --yes`

## Execute destructive reset
In Supabase SQL editor (target env), run:
- `supabase/scripts/reset_backoffice_domain.sql`

## Re-seed baseline
1. Ensure `backoffice_allowed_domains` includes `salonmagik.com`.
2. Create/provision super admin via edge function flow:
   - deploy function if needed: `supabase functions deploy provision-super-admin`
   - run provisioning flow with intended super-admin email
3. Sign in as super admin and complete 2FA setup.

## Post-reset validation
1. Backoffice users table contains only reseeded super admin.
2. Roles/team/sales tables are empty.
3. Marketing toggles default OFF and can be toggled with 2FA.
4. Marketing behavior:
   - both OFF => signup/login shown, no exclusive access
   - waitlist ON => exclusive access shown
   - other-countries ON => interest CTA/modal shown

## Environment order
- Dev -> Staging -> Prod

## Rollback
If reset outcome is incorrect, restore from the backup dump captured in pre-flight.
