-- "Customers can read own payment intents" (2026-02-07) queries auth.users
-- directly to resolve the caller's email. The authenticated role has no
-- SELECT grant on auth.users, and Postgres evaluates every permissive policy
-- on a table rather than short-circuiting once one matches — so this policy
-- threw "permission denied for table users" on *every* select against
-- payment_intents, for every role, regardless of whether this particular
-- policy would have matched. That silently broke salon-admin's Transactions
-- page from ever surfacing pending payment_intents rows (tenant staff never
-- got past this error), on top of blocking the customer-facing use case it
-- was written for.
--
-- auth.jwt() ->> 'email' reads the email straight off the caller's own JWT
-- claims — no table access needed — and is the standard Supabase RLS idiom
-- for this exact check.
drop policy if exists "Customers can read own payment intents" on public.payment_intents;
create policy "Customers can read own payment intents"
on public.payment_intents
for select
using (customer_email = (auth.jwt() ->> 'email'));
