# Backoffice Data Reset Runbook (Operator Controlled)

## Scope
This runbook documents the controls around a destructive reset. The reset SQL is intentionally not stored in this repository. Only an approved database operator should perform it in the target Supabase project after confirming the environment and backup.

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
Use the organization’s restricted database-operations procedure or a separately stored, access-controlled migration. Do not paste destructive reset SQL into application code, edge functions, or a public repository.

## Re-seed baseline
1. Ensure `backoffice_allowed_domains` includes `salonmagik.com`.
2. Create/provision the super admin through the protected operator flow. The bootstrap function requires the separately managed `PROVISION_SUPER_ADMIN_SECRET`.
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
