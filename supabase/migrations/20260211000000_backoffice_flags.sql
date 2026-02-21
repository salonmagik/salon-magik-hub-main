-- Backoffice auth flags (temp password + optional enforced 2FA)

alter table if exists public.backoffice_users
  add column if not exists temp_password_required boolean default true,
  add column if not exists password_changed_at timestamptz,
  add column if not exists totp_required boolean default false,
  add column if not exists totp_enabled boolean default false,
  add column if not exists totp_verified_at timestamptz,
  add column if not exists is_active boolean default true;

comment on column public.backoffice_users.temp_password_required is 'Force user to change the temporary password on next login.';
comment on column public.backoffice_users.totp_required is 'If true, user must enable 2FA before accessing app.';
