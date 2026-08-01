-- #9: changing a phone number in "My Profile" must not collide with any other
-- real account's phone (most concretely: another salon admin's), and must be
-- OTP-verified before it takes effect. This RPC is the uniqueness check,
-- shared by the request/confirm phone-change edge functions.
--
-- Scope: any OTHER profile (salon admin or client) already using this phone
-- blocks the change — two distinct accounts should never share a login phone.

create or replace function public.check_phone_available(
  p_exclude_user_id uuid,
  p_phone text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_conflict boolean;
begin
  if v_phone is null then
    return true;
  end if;

  select exists (
    select 1
    from public.profiles pr
    where pr.phone = v_phone
      and pr.user_id <> p_exclude_user_id
  ) into v_conflict;

  return not v_conflict;
end;
$$;

grant execute on function public.check_phone_available(uuid, text) to service_role;

-- Attempt-limiting for OTP verification (used by the new phone-change
-- request/confirm functions below, built from the start with brute-force
-- protection rather than adding it later). A token is invalidated after too
-- many wrong guesses, forcing a fresh OTP request instead of unlimited
-- retries against a single 6-digit code.
alter table public.phone_otp_tokens
  add column if not exists attempts integer not null default 0;
