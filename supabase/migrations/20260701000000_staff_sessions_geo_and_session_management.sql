-- Add geo/device/reason columns to staff_sessions (mirror backoffice_sessions schema).
-- These are populated by the touch-staff-session edge function at login time.
alter table public.staff_sessions
  add column if not exists session_token text,
  add column if not exists ip_address text,
  add column if not exists user_agent text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists region text,
  add column if not exists end_reason text
    check (end_reason in ('logout', 'expired', 'replaced', 'force_ended'));

-- Unique constraint on session_token so the upsert in touch-staff-session works.
alter table public.staff_sessions
  add constraint staff_sessions_session_token_key unique (session_token);

-- Add a per-user flag that lets an owner grant a specific manager the ability
-- to view and revoke other staff members' sessions. Owners always have this
-- capability by virtue of their role; this flag extends it to selected managers.
alter table public.user_roles
  add column if not exists can_manage_staff_sessions boolean not null default false;

-- Index to quickly fetch active sessions for a tenant (used in the sessions UI).
create index if not exists idx_staff_sessions_tenant_active
  on public.staff_sessions (tenant_id, ended_at)
  where ended_at is null;
