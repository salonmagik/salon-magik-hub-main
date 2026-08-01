-- Tracks phone-ownership verification independently of Supabase's own
-- auth.users.phone/phone_confirmed_at columns. Those can't be used here:
-- auth.users.phone is UNIQUE across the whole project, but salon-admin and
-- client-portal accounts are deliberately separate identities that can
-- legitimately share the same real-world phone number (see
-- auth-resolve-identifier's identity-separation comment). This column lives
-- on profiles instead, scoped per-account.
alter table public.profiles
  add column if not exists phone_verified_at timestamptz;
