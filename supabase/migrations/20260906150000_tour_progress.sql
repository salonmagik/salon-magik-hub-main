-- Product-tour "seen" state lived only in localStorage, keyed by user id —
-- meaning it was scoped to one browser, not the account. Logging out and
-- back in, switching devices, or clearing site data reset every tour to
-- unseen, re-showing walkthroughs the user had already dismissed.
--
-- ~40+ distinct walkthrough ids exist today (apps/salon-admin/src/lib/
-- walkthroughs.ts) and the set grows as features ship, so this is a table
-- of (user, walkthrough) rows rather than a fixed set of boolean columns.
create table public.tour_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  walkthrough_id text not null,
  seen_at timestamptz not null default now(),
  unique (user_id, walkthrough_id)
);

alter table public.tour_progress enable row level security;

create policy "Users manage their own tour progress"
on public.tour_progress
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index idx_tour_progress_user on public.tour_progress(user_id);
