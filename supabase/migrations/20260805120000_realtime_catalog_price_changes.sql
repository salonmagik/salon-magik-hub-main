-- Lets the public booking page detect a salon changing a service/package/
-- product price in real time (proactive toast + background catalog
-- refetch) instead of only catching it via the stale-price 409 at
-- checkout. Existing anon SELECT policies ("Anon can read active
-- services/packages/products for booking") already scope what an
-- unauthenticated booking-page visitor can see via postgres_changes.
--
-- REPLICA IDENTITY FULL is required so UPDATE payloads include the
-- previous row (payload.old) — default identity only carries the primary
-- key, which would make it impossible to tell a price edit apart from an
-- unrelated field edit (description, duration, etc.) client-side.
alter table public.services replica identity full;
alter table public.packages replica identity full;
alter table public.products replica identity full;

alter publication supabase_realtime add table public.services;
alter publication supabase_realtime add table public.packages;
alter publication supabase_realtime add table public.products;
