-- Platform-wide "does a Salon Magik customer account already exist for this
-- email" check, exposing nothing beyond a boolean (unlike
-- lookup_booking_customer_match, which is tenant-scoped and also returns a
-- first name). Used by the booking wizard's checked-email fields -- the
-- booker's own "Your Information" step when they edit an already-confirmed
-- email, and the gift-recipient step's email-first flow -- to decide
-- whether to collect fresh name/phone details or treat the person as
-- already on file, without leaking who they are if the check comes back
-- true for someone else's account.
create or replace function public.customer_identity_exists(
  p_email text
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
      and p_email is not null
      and trim(p_email) <> ''
      and lower(trim(c.email)) = lower(trim(p_email))
  );
$$;

grant execute on function public.customer_identity_exists(text) to anon, authenticated;
