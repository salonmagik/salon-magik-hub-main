-- Client-portal email currently can't be changed at all (the Profile tab
-- field is read-only). Adding that capability needs its own OTP mechanism:
-- Supabase's native generateLink/email_otp trick (already used by
-- send-client-login-otp) only works for an email that ALREADY belongs to an
-- existing auth user — using it against a brand-new, unclaimed address would
-- implicitly create an orphan auth user for that email as a side effect.
-- This table mirrors phone_otp_tokens instead, fully under our own control.
create table if not exists public.email_otp_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_hash text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempts integer not null default 0,
  used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ip_address text
);

create index if not exists idx_email_otp_tokens_email_created
  on public.email_otp_tokens (email, created_at);

create index if not exists idx_email_otp_tokens_ip_created
  on public.email_otp_tokens (ip_address, created_at)
  where ip_address is not null;

alter table public.email_otp_tokens enable row level security;
-- No policies: only the service role (edge functions) touches this table.

-- Mirrors check_phone_available — the canonical email lives on auth.users
-- (profiles has no email column), so check there rather than customers.email.
create or replace function public.check_email_available(
  p_exclude_user_id uuid,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_conflict boolean;
begin
  if v_email is null then
    return true;
  end if;

  select exists (
    select 1 from auth.users
    where lower(email) = v_email
      and id <> p_exclude_user_id
  ) into v_conflict;

  return not v_conflict;
end;
$$;

grant execute on function public.check_email_available(uuid, text) to service_role;
