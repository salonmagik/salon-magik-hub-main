-- create-public-booking already blocks (409) a booking at final submission
-- when the entered phone matches an existing customer whose stored email
-- differs — but only there, after the customer has filled in every step
-- and is one click from payment. Surfacing the same check proactively on
-- Step 3 needs an anon-safe way to ask "would this combination conflict"
-- without leaking the other customer's actual email/name to whoever is
-- typing (unlike lookup_booking_customer_match, which intentionally
-- reveals a first name for the softer gift-recipient nudge — this one
-- returns a bare boolean, nothing else).
--
-- Mirrors create-public-booking/index.ts's normalization exactly (trim+
-- lowercase for email, digits-only for phone) so the proactive client-side
-- check and the final server-side block never disagree.
create or replace function public.check_booking_phone_email_conflict(
  p_tenant_id uuid,
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
    where c.tenant_id = p_tenant_id
      and c.status is distinct from 'deleted'
      and p_phone is not null
      and regexp_replace(c.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
      and regexp_replace(p_phone, '[^0-9]', '', 'g') <> ''
      and c.email is not null
      and p_email is not null
      and lower(trim(c.email)) <> lower(trim(p_email))
  );
$$;

grant execute on function public.check_booking_phone_email_conflict(uuid, text, text) to anon, authenticated;
