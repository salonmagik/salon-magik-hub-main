-- OTP tokens for custom phone-based login via Arkesel.
-- Replaces supabase.auth.signInWithOtp({ phone }) which uses Twilio.

create table if not exists public.phone_otp_tokens (
  id          uuid        primary key default gen_random_uuid(),
  phone       text        not null,
  otp_hash    text        not null,
  user_id     uuid        references auth.users(id) on delete cascade,
  expires_at  timestamptz not null,
  used        boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- Fast lookup: phone + not expired + not used
create index if not exists phone_otp_tokens_lookup_idx
  on public.phone_otp_tokens (phone, expires_at)
  where not used;

-- Auto-expire old tokens after 1 hour (soft, real cleanup via cron or trigger)
alter table public.phone_otp_tokens enable row level security;
-- No client-facing RLS needed — all operations go through edge functions with service_role
