-- Widen check_booking_phone_email_conflict from per-tenant to platform-wide.
-- A phone number should map to exactly one email regardless of which salon
-- someone is booking with — a customer's own phone showing up with a
-- different email at some other, unrelated salon is exactly the identity
-- mismatch this check exists to catch, so tenant scoping was hiding real
-- conflicts instead of preventing false positives.
--
-- create-public-booking/index.ts calls this same function for its own
-- final-submission block, so there remains exactly one definition of
-- "conflict" anywhere in the system.
drop function if exists public.check_booking_phone_email_conflict(uuid, text, text);

create or replace function public.check_booking_phone_email_conflict(
  p_email text,
  p_phone text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.status is distinct from 'deleted'
      and p_phone is not null
      and regexp_replace(c.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
      and regexp_replace(p_phone, '[^0-9]', '', 'g') <> ''
      and c.email is not null
      and p_email is not null
      and lower(trim(c.email)) <> lower(trim(p_email))
  );
$$;

grant execute on function public.check_booking_phone_email_conflict(text, text) to anon, authenticated, service_role;
