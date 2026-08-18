-- The public marketing Pricing page (apps/marketing, unauthenticated
-- visitors) needs to show the real "Extra communication credits" price the
-- same way it already shows plan_pricing — but the 2026-08-14 fix that added
-- sms_credit_pricing to platform_settings' read allowlist only granted it
-- `to authenticated`. Marketing's pricing page runs as anon, so it still
-- couldn't read it. Bundle prices are meant to be public (they're displayed
-- on this exact page), so anon gets its own narrowly-scoped policy for just
-- this one key rather than widening the authenticated policy's key set.
create policy "Anon can read sms credit pricing"
  on public.platform_settings
  for select
  to anon
  using (key = 'sms_credit_pricing');
